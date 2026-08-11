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
    selectedProgramIds: ["p1"],
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
    selectedProgramIds: ["p2"],
  });
  assert.equal(fixedSpecific.commissionTotal, 7.5);
  assert.equal(fixedSpecific.lines.length, 1);

  // Specific program wins over all-product program for the same product.
  const specificBeatsAll = calculateCommissionForPrograms({
    lines: [
      {
        title: "Hat",
        quantity: 1,
        productId: "gid://shopify/Product/2",
        originalTotal: 20,
        discountedTotal: 20,
      },
    ],
    programs: [
      {
        id: "all",
        name: "All products",
        commissionType: "percentage",
        afterDiscount: true,
        productScope: "all",
        allProductsCommission: 50,
        productCommissions: [],
      },
      {
        id: "hats",
        name: "Hats only",
        commissionType: "fixed",
        afterDiscount: true,
        productScope: "specific",
        allProductsCommission: null,
        productCommissions: [
          { productId: "gid://shopify/Product/2", commission: "3" },
        ],
      },
    ],
  });
  assert.equal(specificBeatsAll.availablePrograms.length, 1);
  assert.equal(specificBeatsAll.availablePrograms[0]?.id, "hats");
  assert.equal(specificBeatsAll.allowMultiSelect, false);
  assert.equal(specificBeatsAll.commissionTotal, 0);

  // Mixed cart: specific product + all-only product => multi-select.
  const mixedCart = calculateCommissionForPrograms({
    lines: [
      {
        title: "Hat",
        quantity: 1,
        productId: "gid://shopify/Product/2",
        originalTotal: 20,
        discountedTotal: 20,
      },
      {
        title: "Mug",
        quantity: 1,
        productId: "gid://shopify/Product/9",
        originalTotal: 10,
        discountedTotal: 10,
      },
    ],
    programs: [
      {
        id: "all",
        name: "All products",
        commissionType: "percentage",
        afterDiscount: true,
        productScope: "all",
        allProductsCommission: 10,
        productCommissions: [],
      },
      {
        id: "hats",
        name: "Hats only",
        commissionType: "fixed",
        afterDiscount: true,
        productScope: "specific",
        allProductsCommission: null,
        productCommissions: [
          { productId: "gid://shopify/Product/2", commission: "3" },
        ],
      },
    ],
    selectedProgramIds: ["hats", "all"],
  });
  assert.equal(mixedCart.allowMultiSelect, true);
  assert.equal(mixedCart.availablePrograms.length, 2);
  // Hat uses specific ($3), mug uses all (10% of 10 = $1)
  assert.equal(mixedCart.commissionTotal, 4);

  const noSelection = calculateCommissionForPrograms({
    lines: [
      {
        title: "Hat",
        quantity: 1,
        productId: "gid://shopify/Product/2",
        originalTotal: 20,
        discountedTotal: 20,
      },
    ],
    programs: [
      {
        id: "hats",
        name: "Hats only",
        commissionType: "fixed",
        afterDiscount: true,
        productScope: "specific",
        allProductsCommission: null,
        productCommissions: [
          { productId: "gid://shopify/Product/2", commission: "3" },
        ],
      },
    ],
    selectedProgramIds: [],
  });
  assert.equal(noSelection.commissionTotal, 0);
  assert.equal(noSelection.availablePrograms.length, 1);

  console.log("commission-calc tests passed");
}

run();
