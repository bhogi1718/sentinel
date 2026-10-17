import { broadcastEventToDashboards } from "../../realtime/socket";
import { AuthenticatedDevice } from "../device/device.types";
import { telegramService } from "../telegram/telegram.service";
import { formatEventMessage } from "../telegram/telegram.messages";
import { eventRepository } from "./event.repository";
import { ListEventsQuery } from "./event.validation";
import { ReportedEvent } from "./event.types";

export const eventService = {
  async recordEvent(device: AuthenticatedDevice, input: ReportedEvent) {
    const event = await eventRepository.create({
      orgId: device.orgId,
      deviceId: device.id,
      type: input.type,
      metadata: input.metadata,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    });

    broadcastEventToDashboards(event);
    void telegramService.sendMessage(
      device.orgId,
      formatEventMessage(device.name, input.type, event.occurredAt, input.metadata),
    );

    return event;
  },

  async listEvents(orgId: string, query: ListEventsQuery) {
    const { items, total } = await eventRepository.findMany({ orgId, ...query });
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
