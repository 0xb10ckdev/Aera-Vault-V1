import { expect } from "chai";

export function shouldBehaveLikeOpynAddressBookGetter(): void {
  it("returns opynAddressBook", async function () {
    expect(await this.putOptionsVault.opynAddressBook()).to.equal(
      this.mocks.addressBook.address,
    );
  });
}
