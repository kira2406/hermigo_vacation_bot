// services/contact.service.ts

import dotenv from "dotenv";

dotenv.config();

// ✅ Define type for contacts map
type ContactsMap = Record<string, string>;



const contacts: ContactsMap = {
  Alex: process.env.CONTACT_NUM1 || "",
  Max: process.env.CONTACT_NUM2 || "",
  Lisa: process.env.CONTACT_NUM3 || "",
  Sara: process.env.CONTACT_NUM4 || "",

};

// ✅ Type-safe function
export function resolveContacts(names: string[] = []): string[] {
  return names
    .map((name) => contacts[name])
    .filter((phone): phone is string => Boolean(phone));
}