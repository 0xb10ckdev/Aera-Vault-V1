import { expect } from "chai";

export function shouldBehaveLikeCheckExpired(): void {
  describe("when called on empty positions", function () {
    it("works", async function () {
      await expect(this.putOptionsVault.checkExpired()).not.to.throw;
    });
  });
}
