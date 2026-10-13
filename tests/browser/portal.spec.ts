import { test, expect, type Page } from "@playwright/test";

async function openForm(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Start with a contact number" }),
  ).toBeVisible();
}
async function verify(page: Page, phone: string) {
  await page.getByLabel("Customer contact number").fill(phone);
  await page.getByLabel("The customer agrees").check();
  await page.getByRole("button", { name: "Send OTP", exact: true }).click();
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Customer details", exact: true }),
  ).toBeVisible();
}
function uniquePhone() {
  return `98${String(Date.now()).slice(-8)}`;
}
test("offline completion syncs once, locks the record and stays usable on mobile", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openForm(page);
  const phone = uniquePhone();
  await verify(page, phone);
  await context.setOffline(true);
  await page.getByLabel("Dealer name", { exact: true }).fill("Motovolt Kolkata");
  await page.getByLabel("Name", { exact: true }).fill("Aarav Test");
  await page.getByLabel("Email", { exact: true }).fill("aarav@example.com");
  await page.getByLabel("Age", { exact: true }).fill("28");
  await page.getByLabel("Product", { exact: true }).selectOption("m7");
  await page.getByLabel("Payment mode", { exact: true }).selectOption("upi");
  await page.getByRole("button", { name: "Save & sync when online" }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting to sync" }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Customer registered." }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Aarav Test", { exact: true })).toBeVisible();
  await expect(
    page.getByText("This entry is submitted and locked."),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        dealerName: "Motovolt Kolkata",
        customerName: "Bypass",
        email: "bypass@example.com", age: "30", productId: "m7", batteryId: "", vin: "", paymentMode: "upi",
        verified: true,
      }),
    });
    return response.status;
  });
  expect(result).toBe(400);
});
test("a lost submission response can be retried without creating another record", async ({
  page,
}) => {
  await openForm(page);
  await verify(page, uniquePhone());
  await page.getByLabel("Dealer name", { exact: true }).fill("Motovolt Kolkata");
  await page.getByLabel("Name", { exact: true }).fill("Response Test");
  await page.getByLabel("Email", { exact: true }).fill("response@example.com");
  await page.getByLabel("Age", { exact: true }).fill("31");
  await page.getByLabel("Product", { exact: true }).selectOption("urbn");
  await page.getByLabel("Payment mode", { exact: true }).selectOption("cash");
  let first = true;
  await page.route("**/api/submissions", async (route) => {
    if (first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting to sync" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry submission" }).click();
  await expect(
    page.getByRole("heading", { name: "Customer registered." }),
  ).toBeVisible();
});
test("cross-origin OTP requests and unbound submissions are denied", async ({
  request,
}) => {
  const cross = await request.post("/api/otp/start", {
    headers: { Origin: "https://attacker.example" },
    data: { requestId: crypto.randomUUID(), phone: "9876509999", consent: true },
  });
  expect(cross.status()).toBe(403);
  const guest = await request.post("/api/submissions", {
    headers: { Origin: "http://localhost:3140" },
    data: {},
  });
  expect(guest.status()).toBe(401);
});

test("existing phone is blocked before another OTP and duplicate VIN stays editable", async ({page}) => {
 await openForm(page);
 const phone=uniquePhone(); await verify(page,phone);
 await page.getByLabel("Dealer name",{exact:true}).fill("Motovolt Kolkata");
 await page.getByLabel("Name",{exact:true}).fill("Duplicate Test");
 await page.getByLabel("Email",{exact:true}).fill("duplicate@example.com");
 await page.getByLabel("Age",{exact:true}).fill("26");
 await page.getByLabel("Product",{exact:true}).selectOption("kivo");
 await page.getByLabel("Payment mode",{exact:true}).selectOption("finance");
 const vin="VIN-"+phone;
 await page.getByLabel("VIN number (optional)").fill(vin);
 await page.getByRole("button",{name:"Submit registration",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Customer registered."})).toBeVisible();
 await page.getByRole("button",{name:"Record another customer"}).click();
 await page.getByLabel("Customer contact number").fill(phone);
 await page.getByLabel("The customer agrees").check();
 await page.getByRole("button",{name:"Send OTP",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText("already registered");
 await page.getByLabel("Customer contact number").fill(uniquePhone());
 await page.getByRole("button",{name:"Send OTP",exact:true}).click();
 await page.getByLabel("Verification code").fill("123456");
 await page.getByRole("button",{name:"Verify & continue"}).click();
 await page.getByLabel("Dealer name",{exact:true}).fill("Another Store");
 await page.getByLabel("Name",{exact:true}).fill("Second Customer");
 await page.getByLabel("Email",{exact:true}).fill("second@example.com");
 await page.getByLabel("Age",{exact:true}).fill("30");
 await page.getByLabel("Product",{exact:true}).selectOption("hum");
 await page.getByLabel("Payment mode",{exact:true}).selectOption("card");
 await page.getByLabel("VIN number (optional)").fill(vin.toLowerCase());
 await page.getByRole("button",{name:"Submit registration",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText("VIN number is already registered");
 await expect(page.getByLabel("Name",{exact:true})).toBeEditable();
});
