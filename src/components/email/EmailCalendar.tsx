"use client";

import { useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Campaign, CalendarEvent } from "@/lib/email/types";
import { campaignToEvent } from "@/lib/email/utils";

interface EmailCalendarProps {
  campaigns: Campaign[];
  onEventClick: (campaign: Campaign) => void;
  onDateClick: (dateStr: string) => void;
}

/** FullCalendar monthly view showing campaigns as color-coded events */
export default function EmailCalendar({
  campaigns,
  onEventClick,
  onDateClick,
}: EmailCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);

  // Convert campaigns to calendar events
  const events: CalendarEvent[] = campaigns
    .map(campaignToEvent)
    .filter((e): e is CalendarEvent => e !== null);

  // Re-render events when campaigns change
  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents();
  }, [campaigns]);

  return (
    <div className="email-calendar bg-white rounded-card border border-border-light p-4">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "",
        }}
        height="auto"
        dayMaxEvents={3}
        eventDisplay="block"
        eventClick={(info) => {
          // Find the campaign from extendedProps
          const campaign = info.event.extendedProps.campaign as Campaign;
          if (campaign) onEventClick(campaign);
        }}
        dateClick={(info) => {
          onDateClick(info.dateStr);
        }}
        // Styling overrides applied via globals.css
        // Merge per-event classNames (e.g., recurring-event) with base cursor class
        eventClassNames={(arg) => {
          const extra = arg.event.classNames || [];
          return ["cursor-pointer", ...extra];
        }}
        dayHeaderClassNames="text-xs font-medium text-muted-gray uppercase"
      />
    </div>
  );
}
