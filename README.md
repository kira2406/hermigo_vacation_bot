# ✈️ HermigoBot: Agentic Group Vacation Planner

HermigoBot is an intelligent, multi-agent vacation planning assistant built on the **Linq** platform. It operates directly via text message to help solo travelers or groups collaboratively plan trips. By utilizing an autonomous state-graph architecture, the bot seamlessly routes conversations between specialized AI agents to handle destination consensus, daily itineraries, and flight/hotel bookings.

Built as a submission for the Linq Technical Challenge.

## ✨ Features

* **📱 Native SMS Group Chat Integration:** Operates entirely via text messaging using the Linq Sandbox API.
* **🤖 Multi-Agent Orchestration:** A central orchestrator evaluates conversation context and routes tasks to domain experts:
  * **Destination Agent:** Suggests cities, queries TripAdvisor for attractions, and drives group consensus.
  * **Itinerary Agent:** Builds day-by-day schedules and resolves scheduling conflicts.
  * **Accommodation Agent:** Searches real-time flights and hotels, respects date constraints, and provides booking links.
* **🤝 Consensus Mechanism:** In group chats, critical state transitions (like booking a flight or locking a destination) require explicit agreement from all participants.
* **📬 Reliable Message Processing:** Uses RabbitMQ to queue incoming webhooks and dispatch them to worker nodes, preventing race conditions and dropped messages during high concurrency.
* **🖼️ Rich Media Responses:** Capable of sending location thumbnails and hotel images directly into the chat flow.

## 🛠️ Tech Stack

* **Language:** TypeScript / Node.js
* **LLM Provider:** Anthropic (Claude 3.5 Sonnet & Haiku)
* **Message Broker:** RabbitMQ
* **Database:** PostgreSQL (for conversation state and caching)
* **External APIs:** Linq API, Serp API (Flights/Hotels/TripAdvisor)

## 🏗️ Architecture

1. **Webhook Ingestion:** Linq webhooks are received by the Express server and immediately pushed to a RabbitMQ exchange.
2. **Worker Processing:** `webhook.worker.ts` consumes messages and passes them to the Orchestrator.
3. **State Machine:** The Orchestrator evaluates the `VacationGraphState` (Destination -> Itinerary -> Accommodation -> Complete) and the LLM decides whether to delegate to a specialized agent or handle the message directly.
4. **Tool Execution:** Specialized agents execute tool loops to fetch live data, send localized messages to the chat, or record user consensus in the database.

## 🚀 Getting Started

### Prerequisites

* Node.js (v18+)
* PostgreSQL
* RabbitMQ (can be run via Docker)
* API Keys: Linq Sandbox, Anthropic, and your chosen SERP/Travel APIs.

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Config
PORT=3000

# Infrastructure
DATABASE_URL=postgresql://user:password@localhost:5432/hermes_bot
RABBITMQ_URL=amqp://localhost

# LINQ API BASE URL
LINQ_API_BASE_URL=https://api.linqapp.com/api/partner/v3

# APIs
LINQ_API_KEY=your_linq_sandbox_key
ANTHROPIC_API_KEY=your_anthropic_key
SERPAPI_KEY=your_serp_api_key

# Mock Data (For Sandbox Demo purposes)
CONTACT_NUM1=+1234567890
CONTACT_NUM2=+1987654321
DRY_RUN=true (set this to false to use linq's messaging service)

```

# Installation
- Clone the repository and install dependencies:

```bash
npm install
```
- Start your infrastructure (RabbitMQ/Postgres):

```Bash
docker-compose up -d
```
- Run database migrations (if applicable):

```Bash
npm run db:migrate
```
- Start the development server and worker:
```Bash
npm run dev
```
# 📂 Project Structure
```Plaintext
src/
├── api/
│   └── controllers/     # Webhook endpoints for Linq integration
├── config/              # Environment and DB configurations
├── linq/                # Linq API client wrappers (sendMessage, createGroup)
├── orchestrator/
│   ├── agents/          # Specialized LLM agents (Destination, Itinerary, Accommodation)
│   └── nodes/           # Graph state nodes for tour planning logic
├── services/            # Database operations (hotels, conversations, contacts)
├── util/                # Shared formatters and helpers
└── workers/             # RabbitMQ consumer workers
```

# Architecture

![architecture](assets/architecture.png)

# 🎥 Demo
(Link to your recorded Loom/video demo here)

# Sample Examples

## Location Discussion examples
<table>
  <tr>
    <td width="50%">
      <img src="./assets/location_agent_response.jpg" width="50%" alt="Consensus Flow" />
    </td>
    <td width="50%">
      <h3>1-1 chat</h3>
      <p>HermigoBot sugegsts list of places in destination suggested by the user. Hermigo uses TripAdvisor APi through SERPAPI for fetching this data.
    </td>
  </tr>
</table>

### Group Chat Examples

*Example of handling conflicts in destination discussion*

In this example, the group is talking about multiple locations. A user shows interest for "beaches". Taking this into consideration HermigoBot responds by suggesting lcoations in conflicted places with respect to interests of the users.


<p align="center">
  <img src="./assets/location_chat_first.jpg" width="15%" alt="First Image Description" />
  <img src="./assets/location_response_first.png" width="75%" alt="Second Image Description" />
</p>

Later another user agrees to a common location. HermigoBot recognizes this and suggests some more locations in the agreed location (San Francisco).


<p align="center">
  <img src="./assets/location_chat_second.jpg" width="15%" alt="First Image Description" />
  <img src="./assets/location_response_second.png" width="75%" alt="Second Image Description" />
</p>



## Itinerary Planning Examples

<table>
  <tr>
    <td width="50%">
      <img src="./assets/chat_itinerary.jpg" width="50%" alt="Consensus Flow" />
    </td>
    <td width="50%">
      <h3>1-1 chat</h3>
      <p>HermigoBot asks the user for date and time. Once the user confirms it, the bot proceeds to build an itinerary. The bot makes use of the previous destinations fetched and calculates nearby places using helper functions and builts itinerary day wise.
    </td>
  </tr>
</table>

## Flight Booking Examples

<img src="./assets/chat_flights_1.jpg" width="200" />
<img src="./assets/chat_flights_2.jpg" width="200" />
<img src="./assets/chat_flights_3.jpg" width="200" />

The screenshots illustrate a seamless accommodation workflow managed by HermigoBot within a single chat or group setting. Initially, the bot presents outbound and return flight options, complete with travel details and pricing, prompting a user to make a selection. Once a tentative choice is made, the bot generates a booking link and requires the rest of the group to explicitly confirm the decision. After the participants provide their approval in the chat, the bot locks in the flight selection and autonomously transitions to the next phase of the trip planning. It then immediately searches for and presents several hotel accommodations, enhancing the options with rich media such as thumbnail images, prices, and brief descriptions to help the group make their final lodging decision.

## Hotel Booking Examples

<img src="./assets/chat_hotels_1.jpg" width="200" />
<img src="./assets/chat_hotels_2.jpg" width="200" />
<img src="./assets/chat_hotels_3.jpg" width="200" />

The screenshots displays hotel booking workflow managed by HermigoBot in a single chat setting. Initially, the bot presents upto 5 options for hotel locations with thumbnails (some apps do not show text and iamges together). The user can request additional information or more photoes about the location. Once a tentative choice is made, HermigoBot confirms the hotel and provides the hotel booking link if available.


# Full chat example

Check the [Full Chat File](assets/full_chat.jpg) for full conversation with hermigoBot for end-to-end trip planning conversation.

# 👨‍💻 Author
Kushwanth Parameshwaraiah