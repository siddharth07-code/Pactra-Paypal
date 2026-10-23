/**
 * PACTUM — VeriPay SHA-256 Merkle Flight Recorder
 * As specified in GEMINI.md Section 7 and SECURITY.md Section 9.
 *
 * Implements:
 * - Canonical JSON serialization with sorted object keys.
 * - Leaf hash: h_i = SHA-256(0x00 || CanonicalJSON(e_i))
 * - Parent hash: h_parent = SHA-256(0x01 || left_hash || right_hash)
 * - Binary hash bytes for internal-node hashing and 64-char hexadecimal encoding at public interfaces.
 * - Documented Odd-Node Policy: If a level has an odd number of nodes (greater than 1),
 *   the isolated last node is promoted directly to the next level without duplication or hashing.
 * - getRootHash(), getTreeLevels(), generateInclusionProof(leafIndex), verifyProof(leafHash, proof, rootHash).
 */

import crypto from "crypto";
import type {
  MerkleEventType,
  MerkleAuditNode,
  MerkleInclusionProof,
  MerkleInclusionProofStep,
} from "../types/pactum";

/**
 * Deterministic Canonical JSON serialization.
 * Recursively sorts all object keys.
 * Handles arrays, primitives, booleans, numbers, and null.
 */
export function canonicalJson(data: unknown): string {
  if (data === undefined) {
    return "";
  }
  if (data === null || typeof data !== "object") {
    return JSON.stringify(data);
  }

  if (Array.isArray(data)) {
    return "[" + data.map((item) => canonicalJson(item)).join(",") + "]";
  }

  const obj = data as Record<string, unknown>;
  const sortedKeys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort();
  const pairs = sortedKeys.map((key) => {
    return JSON.stringify(key) + ":" + canonicalJson(obj[key]);
  });

  return "{" + pairs.join(",") + "}";
}

/**
 * Computes the canonical leaf hash:
 * h_i = SHA-256( 0x00 || CanonicalJSON(event) )
 * Returns binary Buffer.
 */
export function hashLeaf(eventData: unknown): Buffer {
  const jsonStr = canonicalJson(eventData);
  const prefix = Buffer.from([0x00]);
  const dataBuf = Buffer.from(jsonStr, "utf-8");

  return Buffer.from(
    crypto
      .createHash("sha256")
      .update(Buffer.concat([prefix, dataBuf]))
      .digest()
  );
}

/**
 * Computes internal parent hash:
 * h_parent = SHA-256( 0x01 || left_hash || right_hash )
 * Takes binary Buffers for left and right hashes and returns binary Buffer.
 */
export function hashInternalNode(left: Buffer, right: Buffer): Buffer {
  const prefix = Buffer.from([0x01]);
  return Buffer.from(
    crypto
      .createHash("sha256")
      .update(Buffer.concat([prefix, left, right]))
      .digest()
  );
}

/**
 * VeriPay SHA-256 Binary Merkle Tree
 */
export class VeriPayMerkleTree {
  private events: Array<{ eventType: MerkleEventType; data: unknown; timestamp: string }> = [];
  private leafBuffers: Buffer[] = [];
  private auditNodes: MerkleAuditNode[] = [];

  /**
   * Appends an event to the append-only flight recorder.
   */
  public addEvent(eventType: MerkleEventType, data: unknown, timestamp?: string): MerkleAuditNode {
    const ts = timestamp ?? new Date().toISOString();
    const leafBuf = hashLeaf(data);
    const leafHex = leafBuf.toString("hex");

    // Also compute payload hash (direct SHA-256 of canonical data for payload verification)
    const payloadHash = crypto
      .createHash("sha256")
      .update(Buffer.from(canonicalJson(data), "utf-8"))
      .digest("hex");

    const index = this.events.length;
    const auditNode: MerkleAuditNode = {
      index,
      eventType,
      timestamp: ts,
      payloadHash,
      leafHash: leafHex,
    };

    this.events.push({ eventType, data, timestamp: ts });
    this.leafBuffers.push(leafBuf);
    this.auditNodes.push(auditNode);

    return auditNode;
  }

  /**
   * Returns all recorded audit nodes.
   */
  public getAuditNodes(): MerkleAuditNode[] {
    return [...this.auditNodes];
  }

  /**
   * Returns all tree levels as hexadecimal strings.
   * Level 0 is the leaves. The last level has length 1 (the root).
   *
   * Odd-node policy:
   * If a level has an odd number of nodes > 1, the unpaired rightmost node
   * is carried over (promoted) directly to the parent level without duplication.
   */
  public getTreeLevels(): string[][] {
    if (this.leafBuffers.length === 0) {
      return [[]];
    }

    const levels: Buffer[][] = [[...this.leafBuffers]];

    while (levels[levels.length - 1].length > 1) {
      const currentLevel = levels[levels.length - 1];
      const nextLevel: Buffer[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          nextLevel.push(hashInternalNode(currentLevel[i], currentLevel[i + 1]));
        } else {
          // Odd node: promoted directly to next level
          nextLevel.push(currentLevel[i]);
        }
      }

      levels.push(nextLevel);
    }

    return levels.map((level) => level.map((buf) => buf.toString("hex")));
  }

  /**
   * Computes and returns the 64-character hexadecimal Merkle root.
   * For an empty tree, returns 64 zeros as a canonical empty-state identifier.
   */
  public getRootHash(): string {
    if (this.leafBuffers.length === 0) {
      return "0".repeat(64);
    }

    const levels = this.getTreeLevels();
    const rootLevel = levels[levels.length - 1];
    return rootLevel[0];
  }

  /**
   * Generates a cryptographic inclusion proof for a given leaf index.
   */
  public generateInclusionProof(leafIndex: number): MerkleInclusionProof {
    if (leafIndex < 0 || leafIndex >= this.leafBuffers.length) {
      throw new Error(`Invalid leaf index: ${leafIndex}. Tree has ${this.leafBuffers.length} leaves.`);
    }

    const proof: MerkleInclusionProofStep[] = [];
    const rootHash = this.getRootHash();
    const leafHash = this.leafBuffers[leafIndex].toString("hex");

    if (this.leafBuffers.length === 1) {
      return {
        leafIndex,
        leafHash,
        proof: [],
        rootHash,
      };
    }

    let currentBuffers = [...this.leafBuffers];
    let currentIndex = leafIndex;

    while (currentBuffers.length > 1) {
      const nextBuffers: Buffer[] = [];
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentBuffers.length) {
        // Sibling exists
        proof.push({
          position: isRight ? "left" : "right",
          hash: currentBuffers[siblingIndex].toString("hex"),
        });
      }
      // If sibling doesn't exist (odd node at end), no proof step is added at this level because node is promoted

      // Build next level
      for (let i = 0; i < currentBuffers.length; i += 2) {
        if (i + 1 < currentBuffers.length) {
          nextBuffers.push(hashInternalNode(currentBuffers[i], currentBuffers[i + 1]));
        } else {
          nextBuffers.push(currentBuffers[i]);
        }
      }

      currentBuffers = nextBuffers;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafIndex,
      leafHash,
      proof,
      rootHash,
    };
  }

  /**
   * Verifies an inclusion proof against a designated root hash.
   * Can be invoked statically or as a standalone function.
   */
  public static verifyProof(
    leafHash: string,
    proof: MerkleInclusionProofStep[],
    rootHash: string
  ): boolean {
    if (!leafHash || !rootHash || !Array.isArray(proof)) {
      return false;
    }

    // Validate 64-char hex strings
    const hexRegex = /^[0-9a-fA-F]{64}$/;
    if (!hexRegex.test(leafHash) || !hexRegex.test(rootHash)) {
      return false;
    }

    let current: Buffer = Buffer.from(leafHash, "hex");

    for (const step of proof) {
      if (!hexRegex.test(step.hash)) {
        return false;
      }
      const sibling = Buffer.from(step.hash, "hex");

      if (step.position === "left") {
        current = Buffer.from(hashInternalNode(sibling, current));
      } else if (step.position === "right") {
        current = Buffer.from(hashInternalNode(current, sibling));
      } else {
        return false;
      }
    }

    return current.toString("hex").toLowerCase() === rootHash.toLowerCase();
  }
}

/**
 * Standalone helper for proof verification conforming to the required method signature
 */
export function verifyProof(
  leafHash: string,
  proof: MerkleInclusionProofStep[],
  rootHash: string
): boolean {
  return VeriPayMerkleTree.verifyProof(leafHash, proof, rootHash);
}
