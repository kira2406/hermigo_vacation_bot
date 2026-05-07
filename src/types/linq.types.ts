export interface LinqWebhookPayload {
  event_type: string;
  event_id: string;
  data: {
    chat: {
      id: string;
      is_group: boolean;
    };
    parts: {
      type: string;
      value: string;
    }[];
    sender_handle: {
      handle: string;
    };
  };
}