import { getOrCreateConversation } from "../services/conversation.service.js";
import { sendMessageToChat, sendReactionToChat } from "../services/linq.service.js";
import { generateLlmResponse } from "../services/orchestration_llm.service.js";
import { destinationAgent } from "../agents/destination.agent.js";
import { sendReaction, type Reaction } from "../linq/client.js";

type BuiltInReaction =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";
  
export interface GroupOrchestratorParams {
  text: string;
  sender: string;
  chatId: string;
  eventType: string;
  messageId: string;
}

// Define the expected JSON output from the LLM
interface LlmDecision {
  action: "reply" | "react" | "ignore";
  content?: string | BuiltInReaction; // The message text to send, or the emoji to react with
  reasoning: string; // Helpful for debugging why the bot made its choice
  isConflict?: boolean;  // Added to detect activity deadlocks
  isConsensus?: boolean;
}

// Dynamically generate the system prompt based on group size and vacation state
const generateSystemPrompt = (participantCount: number, vacationState: string) => `
You are the routing brain for "VacationBot", an assistant helping a group of ${participantCount} friends plan a trip.
The current phase of planning is: ${vacationState}.

Your ONLY job is to read the recent conversation history and output a strict JSON object deciding your next action.

AVAILABLE ACTIONS:
1. "ignore": Do absolutely nothing. Use this to let the humans converse.
2. "react": Acknowledge a message with an emoji. Select "love", "like", "dislike", "laugh" ,"emphasize", "question" or a custom emoji to react to the message. This is a lightweight way to express agreement or prompt discussion without sending a new message.;
3. "reply": Send a text message to the group.

RULES FOR ENGAGEMENT (CRITICAL):
- WAIT FOR CONSENSUS: If a new destination, hotel, or idea is proposed, you MUST select "ignore" until at least half of the ${participantCount} participants have chimed in. Let them discuss.
- DIRECT ASK OVERRIDE: If a user explicitly addresses you (e.g., "VacationBot, what do you think?" or "@VacationBot"), you MUST select "reply" immediately, bypassing the waiting rule.
- STALLED CHAT: If an idea has been proposed, but no one has replied for a long time, select "reply" to gently prompt the group for a decision.
- REWARD AGREEMENT: If multiple people agree on something, you can select "react" to validate the agreement, or "reply" to summarize and move the state forward.

CRITICAL: 
If you choose "reply", mirror how humans actually text:
- Use "---" to split your response into separate messages sent individually
- Each message should be 1-2 sentences max
- ALWAYS split longer responses into 2-4 separate messages with ---
- This is NOT optional — multi-sentence responses MUST be split

AGENT DELEGATION:
If you choose "reply" or "react" while in the "destination" stage:
- Set "isConflict" to true if users have different activity interests that prevent a choice.
- Set "isConsensus" to true if the group has agreed on a place and you are ready to suggest what to do there.

OUTPUT FORMAT:
You must return a raw JSON object and nothing else.
{
  "action": "ignore" | "react" | "reply",
  "reasoning": "Briefly explain why you chose this action based on the rules.",
  "content": "If action is 'reply', the message to send. If 'react', the emoji. If 'ignore', leave blank.",
  "isConflict": boolean,
  "isConsensus": boolean
}
`;

export async function groupOrchestrator({ text, sender, chatId, eventType, messageId }: GroupOrchestratorParams) {

  // await sendReaction(
  //       messageId,
  //       {type: "love"} as Reaction,
  //       "add"
  //     )

  // return; // TEMPORARY EARLY EXIT FOR TESTING


  try {
    // 1. Fetch the conversation state & history
    const conversation = await getOrCreateConversation({ chatId, isGroup: true });
    
    // Extract state variables for the LLM
    const participantCount = conversation.participants?.length || 3; // Fallback to 3 if empty
    const currentState = conversation.vacationState || "destination";
    const history = conversation.events.slice(-15);    
    // Format history into a readable string for the LLM
    const formattedHistory = history.map(msg => `[${msg.timestamp || 'unknown'}] ${msg.sender}: ${msg.content}`).join("\n");

    // 1. Get the routing decision using the original prompt + delegation rules
    const systemInstruction = generateSystemPrompt(participantCount, currentState);
    const fullPrompt = `${systemInstruction}\n\nCONVERSATION HISTORY:\n${formattedHistory}\n\nCURRENT MESSAGE:\n${sender}: ${text}`;

    const rawLlmResponse = await generateLlmResponse(fullPrompt);
    let decision: LlmDecision;

    try {
      decision = JSON.parse(rawLlmResponse);
    } catch (parseError) {
      console.error("Failed to parse LLM JSON:", rawLlmResponse);
      return;
    }

    console.log(`🤖 Bot Decision: ${decision.action} | Stage: ${currentState} | Reasoning: ${decision.reasoning} | Conflict: ${decision.isConflict} | Consensus: ${decision.isConsensus}`);

    if (decision.action === "reply" || decision.action === "react") {
      let finalContent: string | undefined = typeof decision.content === "string" ? decision.content : undefined;

      if (currentState === "destination") {
        if (decision.isConflict) {
          // Trigger Destination Agent for "Middle Ground" resolution 
          const agentResult = await destinationAgent(formattedHistory, "conflict");
          if (agentResult != null) {
            finalContent = agentResult;
          }
        } else if (decision.isConsensus) {
          // Trigger Destination Agent for activity suggestions
          const agentResult = await destinationAgent(formattedHistory, "consensus");
          if (agentResult != null) {
            finalContent = agentResult;
          }
          // Logic to update DB state to "itinerary" could go here
        }
      }

      if (finalContent) {
        await sendMessageToChat(chatId, finalContent);
      }
    } else if (decision.action === "react" && decision.content) {
      await sendReaction(
        messageId,
        {type: decision.content} as Reaction,
        "add"
      )
      // await sendReactionToChat({
      //   chatId,
      //   messageId,
      //   reaction: decision.content });
    }

  } catch (error) {
    console.error("❌ Error in group orchestrator:", error);
  }
}