import { randomUUID } from "node:crypto";

export function turnControl(signal, clean) {
  let turn;
  let steer;
  let steering;
  let approval;
  let resolveApproval;
  let expireApproval;
  return {
    ready(threadId, turnId, send) {
      turn = { threadId, turnId };
      steer = send;
    },
    approve(request) {
      if (approval?.state === "pending" || signal.aborted) return Promise.resolve("deny");
      approval = {
        id: randomUUID(), state: "pending", expiresAt: Date.now() + 90_000,
        operation: clean(request.operation).slice(0, 4000),
        paths: clean(request.paths).slice(0, 4000),
        reason: clean(request.reason).slice(0, 2000),
        canApprove: request.canApprove,
      };
      return new Promise((resolve) => {
        const finish = (choice, state) => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          resolveApproval = undefined;
          expireApproval = undefined;
          approval.state = state;
          resolve(choice);
        };
        const abort = () => finish("deny", "expired");
        const timer = setTimeout(abort, 90_000);
        expireApproval = abort;
        resolveApproval = (choice) => finish(choice, choice === "approve" ? "approved" : "denied");
        signal.addEventListener("abort", abort, { once: true });
      });
    },
    finish() {
      expireApproval?.();
    },
    snapshot() {
      return { turn, approval: approval && { ...approval }, steering: steering && { ...steering } };
    },
    receive({ decision, instruction }) {
      if (signal.aborted) return;
      if (resolveApproval && decision?.id === approval.id && Date.now() < approval.expiresAt) {
        resolveApproval(decision.choice === "approve" && approval.canApprove ? "approve" : "deny");
      }
      if (!steer || !instruction || instruction.turnId !== turn.turnId || instruction.id === steering?.id) return;
      const delivery = { id: instruction.id, state: "sending" };
      steering = delivery;
      if (Date.now() >= instruction.expiresAt) {
        delivery.state = "rejected";
        return;
      }
      Promise.resolve(steer(instruction.id, instruction.text)).then(
        (state) => { delivery.state = state; },
        () => { delivery.state = "uncertain"; },
      );
    },
  };
}
