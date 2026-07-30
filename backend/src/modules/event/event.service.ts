import { broadcastEventToDashboards } from "../../realtime/socket";
import { telegramService } from "../telegram/telegram.service";
import { formatEventMessage } from "../telegram/telegram.messages";
import { eventRepository } from "./event.repository";
import { ListEventsQuery } from "./event.validation";
import { ReportedEvent } from "./event.types";

export const eventService = {
  async recordEvent(deviceId: string, deviceName: string, input: ReportedEvent) {
    const event = await eventRepository.create({
      deviceId,
      type: input.type,
      metadata: input.metadata,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    });

    broadcastEventToDashboards(event);
    void telegramService.sendMessage(formatEventMessage(deviceName, input.type, input.metadata));

    return event;
  },

  async listEvents(query: ListEventsQuery) {
    const { items, total } = await eventRepository.findMany(query);
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },
};
