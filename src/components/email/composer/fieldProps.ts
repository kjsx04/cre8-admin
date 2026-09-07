import { PreviewField } from "@/lib/email/preview-wrapper";

/**
 * Props the composer hands to each input so it can be linked to a region of the
 * email preview: a ref (so a click in the preview can focus it) plus focus/blur
 * handlers (so focusing it outlines the region).
 */
export type FieldBinding = {
  ref: (el: HTMLElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
};

export type FieldProps = (field: PreviewField) => FieldBinding;
