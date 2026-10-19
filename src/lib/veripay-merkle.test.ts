import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  hashLeaf,
  hashInternalNode,
  VeriPayMerkleTree,
  verifyProof,
} from "./veripay-merkle";

describe("VeriPay SHA-256 Merkle Flight Recorder Unit Tests", () => {
  describe("Canonical JSON Serialization", () => {
    it("sorts object keys in deterministic alphabetical order regardless of input insertion", () => {
      const obj1 = { z: 1, a: "test", m: [3, 2, 1] };
      const obj2 = { a: "test", m: [3, 2, 1], z: 1 };

      const json1 = canonicalJson(obj1);
      const json2 = canonicalJson(obj2);

      expect(json1).toBe(json2);
      expect(json1).toBe('{"a":"test","m":[3,2,1],"z":1}');
    });

    it("recursively handles nested objects and arrays", () => {
      const nested = {
        outer: { beta: 2, alpha: 1 },
        list: [{ b: "second", a: "first" }],
      };

      const result = canonicalJson(nested);
      expect(result).toBe('{"list":[{"a":"first","b":"second"}],"outer":{"alpha":1,"beta":2}}');
    });
  });

  describe("Leaf and Internal Node Hashing", () => {
    it("computes leaf hash with 0x00 domain separation prefix", () => {
      const data = { sku: "MON-4K-27", price: 320 };
      const leafBuf = hashLeaf(data);

      expect(Buffer.isBuffer(leafBuf)).toBe(true);
      expect(leafBuf.length).toBe(32); // SHA-256 produces 32 bytes
    });

    it("computes internal parent hash with 0x01 domain separation prefix", () => {
      const left = Buffer.alloc(32, 1);
      const right = Buffer.alloc(32, 2);

      const parentBuf = hashInternalNode(left, right);
      expect(Buffer.isBuffer(parentBuf)).toBe(true);
      expect(parentBuf.length).toBe(32);
    });
  });

  describe("Merkle Tree Construction & Level Policies", () => {
    it("handles empty tree returning canonical 64-zero string", () => {
      const tree = new VeriPayMerkleTree();
      expect(tree.getRootHash()).toBe("0".repeat(64));
      expect(tree.getTreeLevels()).toEqual([[]]);
    });

    it("handles single-leaf tree correctly", () => {
      const tree = new VeriPayMerkleTree();
      const node = tree.addEvent("MANDATE_LOCKED", { budget: 8500 });

      expect(tree.getRootHash()).toBe(node.leafHash);
      const proof = tree.generateInclusionProof(0);
      expect(proof.proof.length).toBe(0); // No sibling needed
      expect(verifyProof(proof.leafHash, proof.proof, proof.rootHash)).toBe(true);
    });

    it("handles even leaf count (4 leaves) with perfect binary tree", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { mandateId: "m1" });
      tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", { quotes: 3 });
      tree.addEvent("KERNEL_DOM_ATTESTATION", { url: "https://vendor.com" });
      tree.addEvent("VERIFIED_NEGOTIATION_ROUND", { round: 1 });

      const levels = tree.getTreeLevels();
      expect(levels.length).toBe(3); // Level 0 (4 leaves), Level 1 (2 nodes), Level 2 (1 root)
      expect(levels[0].length).toBe(4);
      expect(levels[1].length).toBe(2);
      expect(levels[2].length).toBe(1);

      const root = tree.getRootHash();
      expect(root).toBe(levels[2][0]);
      expect(root.length).toBe(64);

      // Verify inclusion proof for each of the 4 leaves
      for (let i = 0; i < 4; i++) {
        const proof = tree.generateInclusionProof(i);
        expect(proof.proof.length).toBe(2);
        expect(verifyProof(proof.leafHash, proof.proof, root)).toBe(true);
      }
    });

    it("handles odd leaf count (3 leaves and 5 leaves) according to documented odd-node promotion policy", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { id: 1 });
      tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", { id: 2 });
      tree.addEvent("KERNEL_DOM_ATTESTATION", { id: 3 });

      const levels = tree.getTreeLevels();
      expect(levels[0].length).toBe(3);
      // Level 1: [hash(0,1), promoted(2)] -> length 2
      expect(levels[1].length).toBe(2);
      expect(levels[1][1]).toBe(levels[0][2]); // Promoted odd node
      // Level 2: [hash(L1[0], L1[1])] -> length 1 (root)
      expect(levels[2].length).toBe(1);

      const root = tree.getRootHash();

      // Verify all 3 inclusion proofs
      for (let i = 0; i < 3; i++) {
        const proof = tree.generateInclusionProof(i);
        expect(verifyProof(proof.leafHash, proof.proof, root)).toBe(true);
      }

      // Add 2 more events for total 5 (odd leaf count > 4)
      tree.addEvent("VERIFIED_NEGOTIATION_ROUND", { id: 4 });
      tree.addEvent("ACWORLD_FINAL_STATE_AUDIT", { id: 5 });

      const root5 = tree.getRootHash();
      for (let i = 0; i < 5; i++) {
        const proof = tree.generateInclusionProof(i);
        expect(verifyProof(proof.leafHash, proof.proof, root5)).toBe(true);
      }
    });
  });

  describe("Adversarial Proof & Tampering Tests", () => {
    it("rejects proof with modified leaf hash", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { amount: 8500 });
      tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", { vendor: "A" });

      const proof = tree.generateInclusionProof(0);
      const tamperedLeaf = "a".repeat(64);

      expect(verifyProof(tamperedLeaf, proof.proof, proof.rootHash)).toBe(false);
    });

    it("rejects proof with tampered sibling hash", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { amount: 8500 });
      tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", { vendor: "A" });

      const proof = tree.generateInclusionProof(0);
      const tamperedProof = [{ position: proof.proof[0].position, hash: "f".repeat(64) }];

      expect(verifyProof(proof.leafHash, tamperedProof, proof.rootHash)).toBe(false);
    });

    it("rejects proof checked against wrong root hash", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { amount: 8500 });
      tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", { vendor: "A" });

      const proof = tree.generateInclusionProof(0);
      const wrongRoot = "1".repeat(64);

      expect(verifyProof(proof.leafHash, proof.proof, wrongRoot)).toBe(false);
    });

    it("throws error for out-of-bounds leaf index", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { amount: 8500 });

      expect(() => tree.generateInclusionProof(-1)).toThrow("Invalid leaf index");
      expect(() => tree.generateInclusionProof(5)).toThrow("Invalid leaf index");
    });

    it("rejects malformed proof structures and non-hex inputs safely without crashing", () => {
      expect(verifyProof("invalid-hex", [], "0".repeat(64))).toBe(false);
      expect(verifyProof("0".repeat(64), [{ position: "left", hash: "bad" }], "0".repeat(64))).toBe(false);
      expect(verifyProof("", [], "")).toBe(false);
    });
  });
});
