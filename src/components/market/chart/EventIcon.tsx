import { Info, AlertCircle, CheckCircle, XCircle, ArrowUp, ArrowDown, Calendar, LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  info: Info,
  alert: AlertCircle,
  success: CheckCircle,
  error: XCircle,
  up: ArrowUp,
  down: ArrowDown,
  calendar: Calendar,
};

interface EventIconProps {
  type: string;
  size?: number;
  className?: string;
}

export function EventIcon({ type, size = 16, className }: EventIconProps) {
  const IconComponent = iconMap[type.toLowerCase()] || Info;
  return <IconComponent size={size} className={className} />;
}