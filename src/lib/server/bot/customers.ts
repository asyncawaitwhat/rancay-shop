/**
 * Customer resolution for the bot. WhatsApp customers are stored in the SAME
 * `clients` collection the ERP already uses, so an order placed over WhatsApp
 * shows up against a normal ERP client. We look up by phone first and only
 * create a minimal record when none exists — never overwriting existing data.
 */

import {
  adminQuery,
  runAdminTransaction,
  nextNumberTx,
  serverTimestamp,
} from "../firestore-rest";
import type { Client } from "../../types";

const C = "clients";

export interface CustomerRef {
  id: string;
  englishName: string;
  arabicName: string;
  phone: string;
  isNew: boolean;
}

/** Find an existing ERP client by phone (matches either phone field). */
async function findByPhone(phone: string): Promise<Client | null> {
  const byPhone = await adminQuery<Client>(C, {
    filters: [{ field: "phone", op: "EQUAL", value: phone }],
    limit: 1,
  });
  if (byPhone.length) return byPhone[0];
  const bySecond = await adminQuery<Client>(C, {
    filters: [{ field: "secondPhone", op: "EQUAL", value: phone }],
    limit: 1,
  });
  return bySecond[0] || null;
}

/**
 * Return the ERP client for this phone, creating a basic record if needed.
 * Existing clients are returned untouched (no overwrite of ERP data).
 */
export async function createOrFindCustomer(params: {
  phone: string;
  profileName?: string;
}): Promise<CustomerRef> {
  const existing = await findByPhone(params.phone);
  if (existing) {
    return {
      id: existing.id,
      englishName: existing.englishName,
      arabicName: existing.arabicName,
      phone: existing.phone,
      isNew: false,
    };
  }

  const name = (params.profileName || "").trim() || `WhatsApp ${params.phone}`;

  const id = await runAdminTransaction(async (tx) => {
    const clientCode = await nextNumberTx(tx, "clients", "CL");
    const data: Omit<Client, "id"> = {
      clientCode,
      englishName: name,
      arabicName: name,
      phone: params.phone,
      status: "active",
      notes: "Created automatically from WhatsApp",
      totalSales: 0,
      totalReturns: 0,
      totalPaid: 0,
      balance: 0,
    };
    tx.set(C, clientCode, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return clientCode;
  });

  return { id, englishName: name, arabicName: name, phone: params.phone, isNew: true };
}
