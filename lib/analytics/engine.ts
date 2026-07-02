"use server";

import type { Prisma } from "@/app/generated/prisma/client";
import { $Enums } from "@/app/generated/prisma/client";
import db from "@/lib/prisma";
import { resolveTimezone } from "@/lib/timezone";
import type {
  WorkspaceAnalyticsQuery,
  WorkspaceAnalyticsPayload,
  BurndownPoint,
  FlowPoint,
  LeadTimeRow,
  KPIValue,
  CardStateAtTime,
  HistoryEvent,
} from "./types";

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const MAX_LEAD_TIME_ROWS = 100;

type AnalyticsRange = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
  days: number;
};

type CompletedMetric = {
  leadTimes: number[];
  completedLateCount: number;
  completedCardIds: Set<string>;
  reopenedCardIds: Set<string>;
  rows: LeadTimeRow[];
};

type CoverageMetric = {
  percentage: number;
  estimatedCount: number;
  unestimatedCount: number;
};

type CardHistoryContext = {
  events: HistoryEvent[];
  eventsByCardId: Map<string, HistoryEvent[]>;
  cardIds: string[];
  cardTitles: Map<string, string>;
};

function toHistoryMetadata(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getMetadata(event: HistoryEvent): Record<string, unknown> {
  return event.metadata ?? {};
}

function hasMetadataKey(
  metadata: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(metadata, key);
}

function metadataStringArray(
  metadata: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function metadataNullableNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!hasMetadataKey(metadata, key)) {
    return undefined;
  }

  const value = metadata[key];
  return typeof value === "number" ? value : null;
}

function metadataNullableDate(
  metadata: Record<string, unknown>,
  key: string,
): Date | null | undefined {
  if (!hasMetadataKey(metadata, key)) {
    return undefined;
  }

  const value = metadata[key];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  // Guard against an unparseable date string: `new Date("nonsense")` yields an
  // Invalid Date whose downstream comparisons are all false, silently dropping
  // the card from overdue/late/burndown instead of surfacing the bad metadata.
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function metadataBoolean(
  metadata: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = metadata[key];
  return typeof value === "boolean" ? value : undefined;
}

function getZonedDateParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    hour: Number(byType.get("hour")),
    minute: Number(byType.get("minute")),
    second: Number(byType.get("second")),
  };
}

function formatDateKeyInTimezone(date: Date, timezone: string): string {
  const parts = getZonedDateParts(date, timezone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
  const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toTime = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.floor((toTime - fromTime) / MS_PER_DAY) + 1;
}

function zonedDateTimeToUtc(
  dateKey: string,
  timezone: string,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let utc = desiredUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getZonedDateParts(new Date(utc), timezone);
    const zonedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millisecond,
    );
    const diff = desiredUtc - zonedAsUtc;
    if (diff === 0) {
      break;
    }
    utc += diff;
  }

  return new Date(utc);
}

function startOfDay(dateKey: string, timezone: string): Date {
  return zonedDateTimeToUtc(dateKey, timezone);
}

function endOfDay(dateKey: string, timezone: string): Date {
  return new Date(startOfDay(addDaysToDateKey(dateKey, 1), timezone).getTime() - 1);
}

function rangeFromDateKeys(
  fromKey: string,
  toKey: string,
  timezone: string,
): AnalyticsRange {
  const normalizedFromKey = fromKey <= toKey ? fromKey : toKey;
  const normalizedToKey = fromKey <= toKey ? toKey : fromKey;

  return {
    fromKey: normalizedFromKey,
    toKey: normalizedToKey,
    from: startOfDay(normalizedFromKey, timezone),
    to: endOfDay(normalizedToKey, timezone),
    days: daysBetweenDateKeys(normalizedFromKey, normalizedToKey),
  };
}

function dateInputToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateRange(
  filters: WorkspaceAnalyticsQuery["filters"],
  timezone: string,
): AnalyticsRange {
  if (filters.from && filters.to) {
    return rangeFromDateKeys(
      dateInputToKey(filters.from),
      dateInputToKey(filters.to),
      timezone,
    );
  }

  const preset = filters.preset ?? "30d";
  const days = Number.parseInt(preset, 10);
  const toKey = formatDateKeyInTimezone(new Date(), timezone);
  const fromKey = addDaysToDateKey(toKey, -(days - 1));

  return rangeFromDateKeys(fromKey, toKey, timezone);
}

function getPreviousPeriod(range: AnalyticsRange, timezone: string): AnalyticsRange {
  const previousToKey = addDaysToDateKey(range.fromKey, -1);
  const previousFromKey = addDaysToDateKey(previousToKey, -(range.days - 1));
  return rangeFromDateKeys(previousFromKey, previousToKey, timezone);
}

function rangeCrossesBoundary(range: AnalyticsRange, launchAt: Date | null): boolean {
  if (!launchAt) {
    return true;
  }

  return range.from < launchAt;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function buildKPI(
  current: number,
  previous: number,
  lowConfidence: boolean,
): KPIValue {
  return {
    current,
    previous,
    change: percentChange(current, previous),
    lowConfidence,
  };
}

function sortEvents(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort(
    (a, b) =>
      Number(a.sequence - b.sequence) ||
      a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
}

function buildEventsByCardId(events: HistoryEvent[]): Map<string, HistoryEvent[]> {
  const result = new Map<string, HistoryEvent[]>();

  for (const event of events) {
    const cardEvents = result.get(event.cardId) ?? [];
    cardEvents.push(event);
    result.set(event.cardId, cardEvents);
  }

  for (const [cardId, cardEvents] of result) {
    result.set(cardId, sortEvents(cardEvents));
  }

  return result;
}

function reconstructCardStateAtTime(
  cardId: string,
  eventsByCardId: Map<string, HistoryEvent[]>,
  targetTime: Date,
): CardStateAtTime | null {
  const cardEvents = eventsByCardId
    .get(cardId)
    ?.filter((event) => event.occurredAt.getTime() <= targetTime.getTime());

  if (!cardEvents || cardEvents.length === 0) {
    return null;
  }

  const state: CardStateAtTime = {
    cardId,
    listId: "",
    listIsDone: false,
    estimateHours: null,
    dueDate: null,
    memberIds: [],
    archivedAt: null,
    deletedAt: null,
    completedAt: null,
  };

  for (const event of cardEvents) {
    const metadata = getMetadata(event);
    const memberIds = metadataStringArray(metadata, "memberIds");
    if (memberIds) {
      state.memberIds = memberIds;
    }

    switch (event.eventType) {
      case $Enums.CardHistoryEventType.CARD_CREATED:
      case $Enums.CardHistoryEventType.BASELINE_CAPTURED: {
        const estimateHours = metadataNullableNumber(metadata, "estimateHours");
        const dueDate = metadataNullableDate(metadata, "dueDate");
        const archivedAt = metadataNullableDate(metadata, "archivedAt");
        const deletedAt = metadataNullableDate(metadata, "deletedAt");
        const completedAt = metadataNullableDate(metadata, "completedAt");
        state.listId = typeof metadata.listId === "string" ? metadata.listId : state.listId;
        state.listIsDone = metadataBoolean(metadata, "listIsDone") ?? state.listIsDone;
        if (estimateHours !== undefined) state.estimateHours = estimateHours;
        if (dueDate !== undefined) state.dueDate = dueDate;
        if (archivedAt !== undefined) state.archivedAt = archivedAt;
        if (deletedAt !== undefined) state.deletedAt = deletedAt;
        if (completedAt !== undefined) state.completedAt = completedAt;
        break;
      }

      case $Enums.CardHistoryEventType.CARD_MOVED: {
        const estimateHours = metadataNullableNumber(metadata, "estimateHours");
        state.listId = typeof metadata.toListId === "string" ? metadata.toListId : state.listId;
        state.listIsDone = metadataBoolean(metadata, "toListIsDone") ?? state.listIsDone;
        if (estimateHours !== undefined) state.estimateHours = estimateHours;
        break;
      }

      case $Enums.CardHistoryEventType.CARD_COMPLETED:
        state.listId = typeof metadata.listId === "string" ? metadata.listId : state.listId;
        state.listIsDone = true;
        if (!state.completedAt) {
          state.completedAt = event.occurredAt;
        }
        break;

      case $Enums.CardHistoryEventType.CARD_REOPENED:
        state.listId = typeof metadata.listId === "string" ? metadata.listId : state.listId;
        state.listIsDone = false;
        state.completedAt = null;
        break;

      case $Enums.CardHistoryEventType.ESTIMATE_SET:
      case $Enums.CardHistoryEventType.ESTIMATE_CHANGED: {
        const estimateHours = metadataNullableNumber(metadata, "nextEstimateHours");
        if (estimateHours !== undefined) state.estimateHours = estimateHours;
        break;
      }

      case $Enums.CardHistoryEventType.DUE_DATE_SET:
      case $Enums.CardHistoryEventType.DUE_DATE_CHANGED:
      case $Enums.CardHistoryEventType.DUE_DATE_CLEARED: {
        const dueDate = metadataNullableDate(metadata, "nextDueDate");
        if (dueDate !== undefined) state.dueDate = dueDate;
        break;
      }

      case $Enums.CardHistoryEventType.CARD_ARCHIVED:
        state.archivedAt = event.occurredAt;
        break;

      case $Enums.CardHistoryEventType.CARD_RESTORED:
        state.archivedAt = null;
        break;

      case $Enums.CardHistoryEventType.CARD_DELETED: {
        const completedAt = metadataNullableDate(metadata, "completedAt");
        const archivedAt = metadataNullableDate(metadata, "archivedAt");
        state.deletedAt = event.occurredAt;
        if (completedAt !== undefined && !state.completedAt) state.completedAt = completedAt;
        if (archivedAt !== undefined) state.archivedAt = archivedAt;
        break;
      }
    }
  }

  return state;
}

function cardMatchesMemberFilter(
  state: CardStateAtTime | null,
  memberId?: string,
): boolean {
  return !memberId || Boolean(state?.memberIds.includes(memberId));
}

function isActiveInBurndownScope(state: CardStateAtTime, at: Date): boolean {
  return !(
    (state.archivedAt && state.archivedAt.getTime() <= at.getTime()) ||
    (state.deletedAt && state.deletedAt.getTime() <= at.getTime()) ||
    (state.completedAt && state.completedAt.getTime() <= at.getTime())
  );
}

function getBurndownValueAt(
  context: CardHistoryContext,
  at: Date,
  memberId?: string,
): number {
  let remainingHours = 0;

  for (const cardId of context.cardIds) {
    const state = reconstructCardStateAtTime(cardId, context.eventsByCardId, at);
    if (!state || !cardMatchesMemberFilter(state, memberId)) continue;
    if (!isActiveInBurndownScope(state, at)) continue;

    if (state.estimateHours !== null && state.estimateHours > 0) {
      remainingHours += state.estimateHours;
    }
  }

  return remainingHours;
}

function buildBurndownSeries(
  context: CardHistoryContext,
  range: AnalyticsRange,
  timezone: string,
  memberId?: string,
): BurndownPoint[] {
  const points: BurndownPoint[] = [];

  for (let index = 0; index < range.days; index += 1) {
    const dateKey = addDaysToDateKey(range.fromKey, index);
    const dayEnd = endOfDay(dateKey, timezone);
    points.push({
      date: dateKey,
      remainingHours: getBurndownValueAt(context, dayEnd, memberId),
      idealHours: null,
    });
  }

  if (points.length === 1) {
    points[0].idealHours = points[0].remainingHours;
    return points;
  }

  const firstDayRemaining = points[0]?.remainingHours ?? 0;
  const lastIndex = points.length - 1;
  for (let index = 0; index <= lastIndex; index += 1) {
    points[index].idealHours = Math.round(firstDayRemaining * (1 - index / lastIndex) * 100) / 100;
  }

  return points;
}

function findFirstCompletionEvent(cardEvents: HistoryEvent[]): HistoryEvent | null {
  return cardEvents.find((event) => {
    if (event.eventType !== $Enums.CardHistoryEventType.CARD_COMPLETED) {
      return false;
    }

    const metadata = getMetadata(event);
    return metadataBoolean(metadata, "firstCompletion") !== false;
  }) ?? null;
}

function findCreatedEvent(cardEvents: HistoryEvent[]): HistoryEvent | null {
  return cardEvents.find(
    (event) => event.eventType === $Enums.CardHistoryEventType.CARD_CREATED,
  ) ?? null;
}

function eventMatchesMemberFilter(event: HistoryEvent, memberId?: string): boolean {
  if (!memberId) {
    return true;
  }

  const memberIds = metadataStringArray(getMetadata(event), "memberIds");
  return Boolean(memberIds?.includes(memberId));
}

function computeCompletedMetrics(
  context: CardHistoryContext,
  range: AnalyticsRange,
  memberId?: string,
  includeRows = false,
): CompletedMetric {
  const leadTimes: number[] = [];
  const completedCardIds = new Set<string>();
  const reopenedCardIds = new Set<string>();
  const rows: LeadTimeRow[] = [];
  let completedLateCount = 0;

  for (const cardId of context.cardIds) {
    const cardEvents = context.eventsByCardId.get(cardId) ?? [];
    const completionEvent = findFirstCompletionEvent(cardEvents);
    const createdEvent = findCreatedEvent(cardEvents);

    if (!completionEvent || !createdEvent) {
      continue;
    }

    if (
      completionEvent.occurredAt < range.from ||
      completionEvent.occurredAt > range.to ||
      !eventMatchesMemberFilter(completionEvent, memberId)
    ) {
      continue;
    }

    completedCardIds.add(cardId);
    const leadTimeHours = (completionEvent.occurredAt.getTime() - createdEvent.occurredAt.getTime()) / MS_PER_HOUR;
    leadTimes.push(leadTimeHours);

    const dueDate = metadataNullableDate(getMetadata(completionEvent), "dueDate");
    const wasLate = Boolean(dueDate && dueDate.getTime() < completionEvent.occurredAt.getTime());
    if (wasLate) {
      completedLateCount += 1;
    }

    const hasReopenInRange = cardEvents.some(
      (event) =>
        event.eventType === $Enums.CardHistoryEventType.CARD_REOPENED &&
        event.occurredAt > completionEvent.occurredAt &&
        event.occurredAt >= range.from &&
        event.occurredAt <= range.to &&
        eventMatchesMemberFilter(event, memberId),
    );
    if (hasReopenInRange) {
      reopenedCardIds.add(cardId);
    }

    if (includeRows) {
      rows.push({
        cardId,
        cardTitle: context.cardTitles.get(cardId) ?? "Untitled card",
        createdAt: createdEvent.occurredAt,
        completedAt: completionEvent.occurredAt,
        leadTimeHours,
        dueDate: dueDate ?? null,
        wasLate,
      });
    }
  }

  // Cap AFTER sorting by completedAt desc so the detail table shows the newest
  // completions, not an arbitrary MAX_LEAD_TIME_ROWS in cardIds (creation) order.
  // Capping during collection would let the table disagree with totalCompleted.
  rows.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  return {
    leadTimes,
    completedLateCount,
    completedCardIds,
    reopenedCardIds,
    rows: rows.slice(0, MAX_LEAD_TIME_ROWS),
  };
}

function computeOverdue(
  context: CardHistoryContext,
  at: Date,
  memberId?: string,
): number {
  let overdue = 0;

  for (const cardId of context.cardIds) {
    const state = reconstructCardStateAtTime(cardId, context.eventsByCardId, at);
    if (!state || !cardMatchesMemberFilter(state, memberId)) continue;
    if (!isActiveInBurndownScope(state, at)) continue;

    if (state.dueDate && state.dueDate.getTime() < at.getTime()) {
      overdue += 1;
    }
  }

  return overdue;
}

function computeCoverage(
  context: CardHistoryContext,
  at: Date,
  memberId?: string,
): CoverageMetric {
  let estimatedCount = 0;
  let totalCount = 0;

  for (const cardId of context.cardIds) {
    const state = reconstructCardStateAtTime(cardId, context.eventsByCardId, at);
    if (!state || !cardMatchesMemberFilter(state, memberId)) continue;
    if (!isActiveInBurndownScope(state, at)) continue;

    totalCount += 1;
    if (state.estimateHours !== null && state.estimateHours > 0) {
      estimatedCount += 1;
    }
  }

  return {
    percentage: totalCount > 0 ? (estimatedCount / totalCount) * 100 : 0,
    estimatedCount,
    unestimatedCount: totalCount - estimatedCount,
  };
}

function computeFlowSeries(
  context: CardHistoryContext,
  range: AnalyticsRange,
  timezone: string,
  memberId?: string,
): { points: FlowPoint[]; createdTotal: number; completedTotal: number } {
  const created = new Array<number>(range.days).fill(0);
  const completed = new Array<number>(range.days).fill(0);

  const indexFor = (date: Date): number => {
    const key = formatDateKeyInTimezone(date, timezone);
    return daysBetweenDateKeys(range.fromKey, key) - 1;
  };

  for (const cardId of context.cardIds) {
    const cardEvents = context.eventsByCardId.get(cardId) ?? [];

    const createdEvent = findCreatedEvent(cardEvents);
    if (createdEvent && eventMatchesMemberFilter(createdEvent, memberId)) {
      const i = indexFor(createdEvent.occurredAt);
      if (i >= 0 && i < range.days) created[i] += 1;
    }

    const completionEvent = findFirstCompletionEvent(cardEvents);
    if (completionEvent && eventMatchesMemberFilter(completionEvent, memberId)) {
      const i = indexFor(completionEvent.occurredAt);
      if (i >= 0 && i < range.days) completed[i] += 1;
    }
  }

  const points: FlowPoint[] = [];
  for (let i = 0; i < range.days; i += 1) {
    points.push({
      date: addDaysToDateKey(range.fromKey, i),
      created: created[i],
      completed: completed[i],
    });
  }

  return {
    points,
    createdTotal: created.reduce((sum, value) => sum + value, 0),
    completedTotal: completed.reduce((sum, value) => sum + value, 0),
  };
}

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { timezone: true },
  });
  return resolveTimezone(workspace?.timezone);
}

async function getWorkspaceAnalyticsLaunch(workspaceId: string): Promise<Date | null> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { analyticsLaunchAt: true },
  });
  return workspace?.analyticsLaunchAt ?? null;
}

export async function getWorkspaceAnalytics(
  query: WorkspaceAnalyticsQuery,
): Promise<WorkspaceAnalyticsPayload> {
  const { workspaceId, filters } = query;

  const timezone = await getWorkspaceTimezone(workspaceId);
  const launchAt = await getWorkspaceAnalyticsLaunch(workspaceId);
  const range = parseDateRange(filters, timezone);
  const previousRange = getPreviousPeriod(range, timezone);

  const boardsQuery: Prisma.BoardWhereInput = {
    workspaceId,
    ...(filters.includeArchivedBoards ? {} : { archivedAt: null }),
  };
  if (filters.boardId) {
    boardsQuery.id = filters.boardId;
  }

  const boards = await db.board.findMany({
    where: boardsQuery,
    select: { id: true },
  });
  const boardIds = boards.map((board) => board.id);

  const rawHistoryEvents = boardIds.length > 0
    ? await db.cardHistoryEvent.findMany({
        where: {
          workspaceId,
          boardId: { in: boardIds },
          occurredAt: { lte: range.to },
        },
        orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }],
      })
    : [];
  const events: HistoryEvent[] = rawHistoryEvents.map((event) => ({
    sequence: event.sequence,
    cardId: event.cardId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    metadata: toHistoryMetadata(event.metadata),
  }));
  const eventsByCardId = buildEventsByCardId(events);
  const cardIds = [...eventsByCardId.keys()];

  const cards = cardIds.length > 0
    ? await db.card.findMany({
        where: { id: { in: cardIds } },
        select: { id: true, title: true },
      })
    : [];
  const cardTitles = new Map(cards.map((card) => [card.id, card.title]));
  const context: CardHistoryContext = {
    events,
    eventsByCardId,
    cardIds,
    cardTitles,
  };

  const comparisonLowConfidence =
    rangeCrossesBoundary(range, launchAt) ||
    rangeCrossesBoundary(previousRange, launchAt);
  const selectedRangeCrossesBoundary = rangeCrossesBoundary(range, launchAt);

  const burndown = buildBurndownSeries(context, range, timezone, filters.memberId);
  const previousBurndown = buildBurndownSeries(
    context,
    previousRange,
    timezone,
    filters.memberId,
  );

  const currentCompleted = computeCompletedMetrics(
    context,
    range,
    filters.memberId,
    true,
  );
  const previousCompleted = computeCompletedMetrics(
    context,
    previousRange,
    filters.memberId,
  );

  const currentEnd = endOfDay(range.toKey, timezone);
  const previousEnd = endOfDay(previousRange.toKey, timezone);
  const currentCoverage = computeCoverage(context, currentEnd, filters.memberId);
  const previousCoverage = computeCoverage(context, previousEnd, filters.memberId);
  const remainingHoursCurrent = burndown.at(-1)?.remainingHours ?? 0;
  const remainingHoursPrevious = previousBurndown.at(-1)?.remainingHours ?? 0;
  const reopenRateCurrent = currentCompleted.completedCardIds.size > 0
    ? (currentCompleted.reopenedCardIds.size / currentCompleted.completedCardIds.size) * 100
    : 0;
  const reopenRatePrevious = previousCompleted.completedCardIds.size > 0
    ? (previousCompleted.reopenedCardIds.size / previousCompleted.completedCardIds.size) * 100
    : 0;

  return {
    filters: {
      ...filters,
      workspaceId,
      from: range.from,
      to: range.to,
      workspaceTimezone: timezone,
    },
    burndown,
    flow: computeFlowSeries(context, range, timezone, filters.memberId),
    leadTime: {
      median: buildKPI(
        median(currentCompleted.leadTimes),
        median(previousCompleted.leadTimes),
        comparisonLowConfidence,
      ),
      average: buildKPI(
        average(currentCompleted.leadTimes),
        average(previousCompleted.leadTimes),
        comparisonLowConfidence,
      ),
      rows: currentCompleted.rows,
      totalCompleted: currentCompleted.completedCardIds.size,
    },
    remainingHours: buildKPI(
      remainingHoursCurrent,
      remainingHoursPrevious,
      comparisonLowConfidence,
    ),
    overdue: buildKPI(
      computeOverdue(context, currentEnd, filters.memberId),
      computeOverdue(context, previousEnd, filters.memberId),
      comparisonLowConfidence,
    ),
    completedLate: buildKPI(
      currentCompleted.completedLateCount,
      previousCompleted.completedLateCount,
      comparisonLowConfidence,
    ),
    reopenRate: buildKPI(
      reopenRateCurrent,
      reopenRatePrevious,
      comparisonLowConfidence,
    ),
    estimationCoverage: {
      current: currentCoverage.percentage,
      estimatedCount: currentCoverage.estimatedCount,
      unestimatedCount: currentCoverage.unestimatedCount,
      previous: previousCoverage.percentage,
      change: percentChange(currentCoverage.percentage, previousCoverage.percentage),
      lowConfidence: comparisonLowConfidence,
    },
    launchBoundary: {
      analyticsLaunchAt: launchAt,
      selectedRangeCrossesBoundary,
      message: selectedRangeCrossesBoundary
        ? "Selected range includes periods before full analytics history was captured. Some metrics may be incomplete."
        : undefined,
    },
    comparisonPeriod: {
      from: previousRange.from,
      to: previousRange.to,
    },
  };
}
