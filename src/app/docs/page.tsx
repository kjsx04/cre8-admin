"use client";

import { DOC_TYPES } from "@/lib/constants";
import DocTypeCard from "@/components/DocTypeCard";
import { PageContainer, PageHeader, Section } from "@/components/ui";

/* Group doc types into categories (LOIs first, then listing agreements) */
const CATEGORIES = [
  {
    label: "Letters of intent",
    slugs: ["loi-land", "loi-building", "loi-lease"],
  },
  {
    label: "Listing agreements",
    slugs: ["listing-sale", "listing-sale-lease", "listing-lease"],
  },
];

export default function DocsPage() {
  return (
    // Shared page wrapper + header
    <PageContainer width="default">
      <PageHeader title="Documents" description="Select a document type to get started." />

      {/* One section per category, each a grid of DocTypeCards */}
      <div className="space-y-8">
        {CATEGORIES.map((cat) => {
          // Look up the full DocType for each slug (skips anything missing from DOC_TYPES)
          const docTypes = cat.slugs
            .map((slug) => DOC_TYPES.find((d) => d.slug === slug))
            .filter((d): d is NonNullable<typeof d> => !!d);

          return (
            <Section key={cat.label} title={cat.label}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {docTypes.map((docType) => (
                  <DocTypeCard key={docType.id} docType={docType} />
                ))}
              </div>
            </Section>
          );
        })}
      </div>
    </PageContainer>
  );
}
