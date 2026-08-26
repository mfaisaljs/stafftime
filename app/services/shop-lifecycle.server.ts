import prisma from "../db.server";
import { emailService } from "./email.server";
import { shopFromDest } from "../utils/http.server";

type WebhookCustomer = {
  id?: number;
  email?: string | null;
  phone?: string | null;
};

export function normalizeShopDomain(shop: string) {
  return shopFromDest(shop).toLowerCase();
}

export async function deleteShopSessions(shop: string) {
  const domain = normalizeShopDomain(shop);
  return prisma.session.deleteMany({ where: { shop: domain } });
}

export async function deleteShopData(shop: string) {
  const domain = normalizeShopDomain(shop);
  await deleteShopSessions(domain);
  const existing = await prisma.shop.findUnique({ where: { domain } });
  if (!existing) {
    return { deleted: false };
  }
  await prisma.shop.delete({ where: { domain } });
  return { deleted: true };
}

export async function handleAppUninstalled(shop: string) {
  const domain = normalizeShopDomain(shop);
  const shopRecord = await prisma.shop.findUnique({ where: { domain } });

  try {
    await emailService.sendAppUninstallationNotification(
      domain,
      shopRecord?.name ?? undefined,
    );
  } catch (emailError) {
    console.error(
      "Failed to send uninstallation email notification:",
      emailError,
    );
  }

  await deleteShopSessions(shop);
  return deleteShopData(shop);
}

export async function handleShopRedact(shop: string) {
  return deleteShopData(shop);
}

export async function handleCustomersDataRequest(params: {
  shop: string;
  customer?: WebhookCustomer | null;
}) {
  const domain = normalizeShopDomain(params.shop);
  const shopRecord = await prisma.shop.findUnique({ where: { domain } });
  if (!shopRecord || !params.customer) {
    return { matchedEmployees: 0 };
  }

  const employees = await findEmployeesForCustomer(shopRecord.id, params.customer);
  return { matchedEmployees: employees.length };
}

export async function handleCustomersRedact(params: {
  shop: string;
  customer?: WebhookCustomer | null;
}) {
  const domain = normalizeShopDomain(params.shop);
  const shopRecord = await prisma.shop.findUnique({ where: { domain } });
  if (!shopRecord || !params.customer) {
    return { redactedEmployees: 0 };
  }

  const employees = await findEmployeesForCustomer(shopRecord.id, params.customer);
  if (!employees.length) {
    return { redactedEmployees: 0 };
  }

  await prisma.employee.updateMany({
    where: { id: { in: employees.map((employee) => employee.id) } },
    data: {
      email: null,
      phone: null,
      paypalEmail: null,
      paypalAccountName: null,
      accountHolderName: null,
      accountNumber: null,
      routingNumber: null,
      swiftBic: null,
      iban: null,
    },
  });

  return { redactedEmployees: employees.length };
}

async function findEmployeesForCustomer(
  shopId: string,
  customer: WebhookCustomer,
) {
  const email = customer.email?.trim().toLowerCase();
  const phone = customer.phone?.trim();

  if (!email && !phone) {
    return [];
  }

  return prisma.employee.findMany({
    where: {
      shopId,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { id: true },
  });
}
