import assert from "node:assert/strict";
import { calculateCommissionForPrograms } from "./commission-calc";

function run() {
  const percentageAll = calculateCommissionForPrograms({
    lines: [
      {
        title: "Shirt",
        quantity: 2,
        productId: "gid://shopify/Product/1",
        originalTotal: 40,
        discountedTotal: 30,
      },
    ],
    programs: [
      {
        id: "p1",
        name: "All %",
        commissionType: "percentage",
        afterDiscount: true,
        productScope: "all",
        allProductsCommission: 10,
        productCommissions: [],
      },
    ],
  });
  assert.equal(percentageAll.commissionTotal, 3);

  const fixedSpecific = calculateCommissionForPrograms({
    lines: [
      {
        title: "Hat",
        quantity: 3,
        productId: "gid://shopify/Product/2",
        originalTotal: 45,
        discountedTotal: 45,
      },
      {
        title: "Other",
        quantity: 1,
        productId: "gid://shopify/Product/9",
        originalTotal: 10,
        discountedTotal: 10,
      },
    ],
    programs: [
      {
        id: "p2",
        name: "Hats",
        commissionType: "fixed",
        afterDiscount: true,
        productScope: "specific",
        allProductsCommission: null,
        productCommissions: [
          { productId: "gid://shopify/Product/2", commission: "2.5" },
        ],
      },
    ],
  });
  assert.equal(fixedSpecific.commissionTotal, 7.5);
  assert.equal(fixedSpecific.lines.length, 1);

  console.log("commission-calc tests passed");
}

run();
