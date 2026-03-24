export function formatTimeLeft(endDate: Date): string {
  const diffMs = endDate.getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function formatNextReview(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}
