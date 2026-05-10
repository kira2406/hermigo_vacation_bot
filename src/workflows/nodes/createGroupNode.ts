import { resolveContacts } from "../../services/contact.service.js";
import { createGroupChat } from "../../linq/index.js";
import type { VacationGraphState } from "../state.js";

export async function createGroupNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  const { participants } = state.decision as any;
  
  const numbers = resolveContacts(participants);
  const allParticipants = [...new Set([state.sender, ...numbers])];

  if (allParticipants.length >= 2) {
    await createGroupChat("Trip Planning Group", state.sender, allParticipants);
    console.log("[CreateGroup] Group created with:", allParticipants);
  }

  return {};
}