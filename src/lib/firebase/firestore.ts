import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  runTransaction,
  type QueryConstraint,
  type Transaction,
} from "firebase/firestore";
import { getDb } from "./client";

export {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  runTransaction,
};
export type { QueryConstraint, Transaction };

export function col(name: string) {
  return collection(getDb(), name);
}

export function docRef(name: string, id: string) {
  return doc(getDb(), name, id);
}

/** Read every document in a collection (optionally constrained) as typed objects. */
export async function listDocs<T>(
  name: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = constraints.length ? query(col(name), ...constraints) : col(name);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
}

export async function getOne<T>(name: string, id: string): Promise<T | null> {
  const snap = await getDoc(docRef(name, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as object) } as T;
}

/** Create a document with an auto id, stamping createdAt/updatedAt. */
export async function createDoc<T extends object>(
  name: string,
  data: T
): Promise<string> {
  const ref = await addDoc(col(name), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Create or overwrite a document at a known id. */
export async function setOne<T extends object>(
  name: string,
  id: string,
  data: T,
  merge = false
): Promise<void> {
  await setDoc(
    docRef(name, id),
    { ...data, updatedAt: serverTimestamp() },
    { merge }
  );
}

export async function updateOne(
  name: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await updateDoc(docRef(name, id), { ...data, updatedAt: serverTimestamp() });
}

export async function removeOne(name: string, id: string): Promise<void> {
  await deleteDoc(docRef(name, id));
}

/**
 * Atomically generate the next formatted document number using the `sequences`
 * collection (Firestore has no auto-increment). Safe under concurrency thanks
 * to the transaction. Returns e.g. "INV-000001".
 */
export async function nextNumber(
  key: string,
  prefix: string,
  pad = 6,
  tx?: Transaction
): Promise<string> {
  const ref = docRef("sequences", key);

  const run = async (t: Transaction) => {
    const snap = await t.get(ref);
    const current = snap.exists() ? (snap.data().value as number) || 0 : 0;
    const next = current + 1;
    t.set(ref, { value: next, prefix, updatedAt: serverTimestamp() }, { merge: true });
    return `${prefix}-${String(next).padStart(pad, "0")}`;
  };

  if (tx) return run(tx);
  return runTransaction(getDb(), run);
}
