import { ExperimentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ExperimentDomainError } from "./errors";
import {
  assertExperimentCanExecute,
  assertValidTransition,
  canTransition,
  getValidTransitions,
} from "./state-machine";

describe("experiment state machine", () => {
  describe("canTransition", () => {
    it("allows DRAFT → AWAITING_APPROVAL", () => {
      expect(
        canTransition(
          ExperimentStatus.DRAFT,
          ExperimentStatus.AWAITING_APPROVAL,
        ),
      ).toBe(true);
    });

    it("allows AWAITING_APPROVAL → APPROVED", () => {
      expect(
        canTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.APPROVED,
        ),
      ).toBe(true);
    });

    it("allows AWAITING_APPROVAL → REJECTED", () => {
      expect(
        canTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.REJECTED,
        ),
      ).toBe(true);
    });

    it("allows REJECTED → DRAFT", () => {
      expect(
        canTransition(ExperimentStatus.REJECTED, ExperimentStatus.DRAFT),
      ).toBe(true);
    });

    it("allows APPROVED → RUNNING", () => {
      expect(
        canTransition(ExperimentStatus.APPROVED, ExperimentStatus.RUNNING),
      ).toBe(true);
    });

    it("allows RUNNING → COMPLETED", () => {
      expect(
        canTransition(ExperimentStatus.RUNNING, ExperimentStatus.COMPLETED),
      ).toBe(true);
    });

    it("allows COMPLETED → ANALYZED", () => {
      expect(
        canTransition(ExperimentStatus.COMPLETED, ExperimentStatus.ANALYZED),
      ).toBe(true);
    });

    it("allows ANALYZED → REPLICATED", () => {
      expect(
        canTransition(ExperimentStatus.ANALYZED, ExperimentStatus.REPLICATED),
      ).toBe(true);
    });

    it("rejects DRAFT → RUNNING", () => {
      expect(
        canTransition(ExperimentStatus.DRAFT, ExperimentStatus.RUNNING),
      ).toBe(false);
    });

    it("rejects AWAITING_APPROVAL → RUNNING", () => {
      expect(
        canTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.RUNNING,
        ),
      ).toBe(false);
    });

    it("rejects REJECTED → RUNNING", () => {
      expect(
        canTransition(ExperimentStatus.REJECTED, ExperimentStatus.RUNNING),
      ).toBe(false);
    });

    it("rejects skipping approval (DRAFT → APPROVED)", () => {
      expect(
        canTransition(ExperimentStatus.DRAFT, ExperimentStatus.APPROVED),
      ).toBe(false);
    });

    it("rejects running without approval (DRAFT → COMPLETED)", () => {
      expect(
        canTransition(ExperimentStatus.DRAFT, ExperimentStatus.COMPLETED),
      ).toBe(false);
    });

    it("rejects transitions out of REPLICATED", () => {
      expect(getValidTransitions(ExperimentStatus.REPLICATED)).toEqual([]);
    });
  });

  describe("assertValidTransition", () => {
    it("throws ExperimentDomainError for invalid transitions", () => {
      expect(() =>
        assertValidTransition(ExperimentStatus.DRAFT, ExperimentStatus.RUNNING),
      ).toThrow(ExperimentDomainError);

      expect(() =>
        assertValidTransition(ExperimentStatus.DRAFT, ExperimentStatus.RUNNING),
      ).toThrow("Invalid experiment transition: DRAFT → RUNNING");
    });

    it("throws with INVALID_TRANSITION code", () => {
      try {
        assertValidTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.RUNNING,
        );
        expect.unreachable("Expected transition to be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(ExperimentDomainError);
        expect((error as ExperimentDomainError).code).toBe("INVALID_TRANSITION");
      }
    });

    it("does not throw for valid transitions", () => {
      expect(() =>
        assertValidTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.APPROVED,
        ),
      ).not.toThrow();

      expect(() =>
        assertValidTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.REJECTED,
        ),
      ).not.toThrow();

      expect(() =>
        assertValidTransition(
          ExperimentStatus.COMPLETED,
          ExperimentStatus.ANALYZED,
        ),
      ).not.toThrow();
    });
  });

  describe("assertExperimentCanExecute", () => {
    it("allows execution only from APPROVED", () => {
      expect(() =>
        assertExperimentCanExecute(ExperimentStatus.APPROVED),
      ).not.toThrow();
    });

    it("blocks DRAFT from running", () => {
      expect(() => assertExperimentCanExecute(ExperimentStatus.DRAFT)).toThrow(
        "Invalid experiment transition: DRAFT → RUNNING",
      );
    });

    it("blocks AWAITING_APPROVAL from running", () => {
      expect(() =>
        assertExperimentCanExecute(ExperimentStatus.AWAITING_APPROVAL),
      ).toThrow(
        "Invalid experiment transition: AWAITING_APPROVAL → RUNNING",
      );
    });

    it("blocks REJECTED experiments from running", () => {
      expect(() =>
        assertExperimentCanExecute(ExperimentStatus.REJECTED),
      ).toThrow("Invalid experiment transition: REJECTED → RUNNING");
    });

    it("blocks COMPLETED experiments from re-running", () => {
      expect(() =>
        assertExperimentCanExecute(ExperimentStatus.COMPLETED),
      ).toThrow("Invalid experiment transition: COMPLETED → RUNNING");
    });
  });

  describe("full lifecycle path", () => {
    const lifecycle: ExperimentStatus[] = [
      ExperimentStatus.DRAFT,
      ExperimentStatus.AWAITING_APPROVAL,
      ExperimentStatus.APPROVED,
      ExperimentStatus.RUNNING,
      ExperimentStatus.COMPLETED,
      ExperimentStatus.ANALYZED,
      ExperimentStatus.REPLICATED,
    ];

    it("supports the complete forward lifecycle", () => {
      for (let index = 0; index < lifecycle.length - 1; index += 1) {
        const from = lifecycle[index];
        const to = lifecycle[index + 1];
        expect(canTransition(from, to)).toBe(true);
      }
    });

    it("supports rejection and revision loop", () => {
      expect(
        canTransition(
          ExperimentStatus.AWAITING_APPROVAL,
          ExperimentStatus.REJECTED,
        ),
      ).toBe(true);
      expect(
        canTransition(ExperimentStatus.REJECTED, ExperimentStatus.DRAFT),
      ).toBe(true);
      expect(
        canTransition(
          ExperimentStatus.DRAFT,
          ExperimentStatus.AWAITING_APPROVAL,
        ),
      ).toBe(true);
    });
  });
});
