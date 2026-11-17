"use client";

import { useState } from "react";
import { PageContainer, PageHeader, Tabs } from "@/components/ui";
import TargetsView from "@/components/demand/TargetsView";
import ReverseView from "@/components/demand/ReverseView";
import TenantsAdmin from "@/components/demand/TenantsAdmin";

type DemandTab = "targets" | "tenant" | "admin";

export default function DemandPage() {
  const [tab, setTab] = useState<DemandTab>("targets");
  const [listingId, setListingId] = useState<string | null>(null);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Demand"
        description="Who could buy, ground lease, or lease a listing, and who to call."
      >
        <Tabs
          items={[
            { value: "targets", label: "By listing" },
            { value: "tenant", label: "By tenant" },
            { value: "admin", label: "Tenants" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>
      {tab === "targets" && <TargetsView listingId={listingId} onListingId={setListingId} />}
      {tab === "tenant" && (
        <ReverseView
          onOpenListing={(id) => {
            setListingId(id);
            setTab("targets");
          }}
        />
      )}
      {tab === "admin" && <TenantsAdmin />}
    </PageContainer>
  );
}
