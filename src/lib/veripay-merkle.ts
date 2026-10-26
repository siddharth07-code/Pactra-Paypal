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

export const EMPTY_TREE_ROOT = "0".repeat(64);

/**
 * Deterministic Canonical JSON serialization.
 * Recursively sorts all object keys.
 * Handles arrays, primitives, booleans, numbers, and null.
 */
export function canonicalJson(data: unknown, activeStack = new Set<object>()): string {
  if (data === undefined) {
    return "";
  }
  if (data === null) {
    return "null";
  }
  if (typeof data === "number") {
    if (!Number.isFinite(data)) {
      throw new Error(`Non-finite number cannot be serialized in canonicalJson: ${data}`);
    }
    return Object.is(data, -0) ? "0" : JSON.stringify(data);
  }
  if (typeof data === "boolean") {
    return JSON.stringify(data);
  }
  if (typeof data === "string") {
    return JSON.stringify(data.normalize("NFC"));
  }
  if (typeof data === "bigint" || typeof data === "function" || typeof data === "symbol") {
    throw new Error(`Unsupported data type in canonicalJson: ${typeof data}`);
  }

  const obj = data as object;
  if (activeStack.has(obj)) {
    throw new Error("Circular reference detected in canonicalJson");
  }
  activeStack.add(obj);

  try {
    if (Array.isArray(data)) {
      return "[" + data.map((item) => canonicalJson(item, activeStack)).join(",") + "]";
    }

    const record = data as Record<string, unknown>;
    const sortedKeys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const pairs = sortedKeys.map((key) => {
      const canonicalKey = JSON.stringify(key.normalize("NFC"));
      return canonicalKey + ":" + canonicalJson(record[key], activeStack);
    });

    return "{" + pairs.join(",") + "}";
  } finally {
    activeStack.delete(obj);
  }
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
    if (this.leafBuffers.length === 0) {
      throw new Error("Cannot generate inclusion proof for an empty Merkle tree.");
    }
    if (typeof leafIndex !== "number" || !Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= this.leafBuffers.length) {
      throw new Error(`Invalid leaf index: ${leafIndex}. Tree has ${this.leafBuffers.length} leaves.`);
    }

    const proof: MerkleInclusionProofStep[] = [];
    const rootHash = this.getRootHash();
    const leafHash = this.leafBuffers[leafIndex].toString("hex");
    const treeSize = this.leafBuffers.length;

    if (this.leafBuffers.length === 1) {
      return {
        leafIndex,
        leafHash,
        proof: [],
        rootHash,
        treeSize: 1,
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
      treeSize,
    };
  }

  /**
   * Verifies an inclusion proof against a designated root hash.
   * Can be invoked statically or as a standalone function.
   * Evaluates explicit tree-size and leaf-index structural rules:
   * - Tree size 0 (empty tree) cannot contain any leaves.
   * - An empty proof path (proof.length === 0) is only structurally sound for leaf index 0 in a single-leaf tree.
   * - Multi-leaf trees (treeSize >= 2) require proof.length >= 1.
   */
  public static verifyProof(
    leafHash: string,
    proof: MerkleInclusionProofStep[],
    rootHash: string,
    options?: { leafIndex?: number; treeSize?: number }
  ): boolean {
    if (!leafHash || !rootHash || !Array.isArray(proof)) {
      return false;
    }

    // Validate 64-char hex strings
    const hexRegex = /^[0-9a-fA-F]{64}$/;
    if (!hexRegex.test(leafHash) || !hexRegex.test(rootHash)) {
      return false;
    }

    // Structural rule 1: If treeSize is specified and <= 0, no inclusion proof can exist
    if (options?.treeSize !== undefined && options.treeSize <= 0) {
      return false;
    }

    // Structural rule 2: An empty proof path is ONLY valid for a 1-leaf tree at index 0
    if (proof.length === 0) {
      // Empty tree sentinel check: an empty tree has 0 leaves and cannot authenticate any leaf
      if (rootHash.toLowerCase() === EMPTY_TREE_ROOT.toLowerCase()) {
        return false;
      }
      if (options?.treeSize !== undefined && options.treeSize !== 1) {
        return false;
      }
      if (options?.leafIndex !== undefined && options.leafIndex !== 0) {
        return false;
      }
      return leafHash.toLowerCase() === rootHash.toLowerCase();
    }

    // Structural rule 3: Multi-step proof requires treeSize >= 2 if treeSize is specified
    if (options?.treeSize !== undefined && options.treeSize < 2) {
      return false;
    }

    // Structural rule 4: leafIndex must be within [0, treeSize - 1]
    if (
      options?.treeSize !== undefined &&
      options?.leafIndex !== undefined &&
      (options.leafIndex < 0 || options.leafIndex >= options.treeSize)
    ) {
      return false;
    }

    let current: Buffer = Buffer.from(leafHash, "hex");

    for (const step of proof) {
      if (!step || typeof step !== "object") {
        return false;
      }
      if (step.position !== "left" && step.position !== "right") {
        return false;
      }
      if (!step.hash || typeof step.hash !== "string" || !hexRegex.test(step.hash)) {
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
  rootHash: string,
  options?: { leafIndex?: number; treeSize?: number }
): boolean {
  return VeriPayMerkleTree.verifyProof(leafHash, proof, rootHash, options);
}

/**
 * Validates a complete MerkleInclusionProof object against an optional expected root
 * and sound tree-size / leaf-index structural bounds.
 */
export function verifyInclusionProof(
  proof: MerkleInclusionProof,
  expectedRoot?: string,
  options?: { treeSize?: number }
): boolean {
  if (!proof || typeof proof !== "object" || !Array.isArray(proof.proof)) {
    return false;
  }
  if (typeof proof.leafIndex !== "number" || !Number.isInteger(proof.leafIndex) || proof.leafIndex < 0) {
    return false;
  }

  const effectiveTreeSize = options?.treeSize ?? proof.treeSize;
  if (effectiveTreeSize !== undefined) {
    if (typeof effectiveTreeSize !== "number" || !Number.isInteger(effectiveTreeSize) || effectiveTreeSize < 1) {
      return false;
    }
    if (proof.leafIndex >= effectiveTreeSize) {
      return false;
    }
  }

  const targetRoot = expectedRoot ?? proof.rootHash;
  if (!targetRoot || proof.rootHash.toLowerCase() !== targetRoot.toLowerCase()) {
    return false;
  }
  if (targetRoot.toLowerCase() === EMPTY_TREE_ROOT.toLowerCase()) {
    return false;
  }

  return verifyProof(proof.leafHash, proof.proof, targetRoot, {
    leafIndex: proof.leafIndex,
    treeSize: effectiveTreeSize,
  });
}
