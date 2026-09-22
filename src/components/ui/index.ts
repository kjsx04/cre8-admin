/**
 * CRE8 Admin UI primitives — import everything from "@/components/ui".
 *
 *   import { Button, Card, Field, Input, Modal, useToast } from "@/components/ui";
 *
 * Rules of the road:
 *   - Use these instead of writing className recipes in pages.
 *   - Colors and sizes come from tailwind.config.ts tokens (no hex, no `text-[11px]`).
 *   - Green = status. Black = action. Uppercase only inside Table headers.
 */
export { cn, FOCUS_RING } from "./cn";
export { default as Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { default as IconButton } from "./IconButton";
export { Input, Textarea, Select, CONTROL } from "./Input";
export { default as Field } from "./Field";
export { Card, CardHeader } from "./Card";
export { Badge, StatusDot } from "./Badge";
export type { Tone } from "./Badge";
export { default as Section } from "./Section";
export { default as Spinner, LoadingBlock } from "./Spinner";
export { Skeleton, TableSkeleton } from "./Skeleton";
export { default as EmptyState } from "./EmptyState";
export { default as Tabs } from "./Tabs";
export type { TabItem } from "./Tabs";
export { Table, THead, TR, TH, TD, TableMessage } from "./Table";
export { PageContainer, PageHeader } from "./Page";
export { default as Modal, useLayerBehavior } from "./Modal";
export { default as SlideOver } from "./SlideOver";
export { ToastProvider, useToast } from "./Toast";
export { ConfirmProvider, useConfirm } from "./Confirm";
