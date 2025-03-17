
import { Info, AlertCircle, CheckCircle, XCircle, ArrowUp, ArrowDown, Calendar, Bell, Flag, Award, Target, FileText, MessageSquare, Bookmark, Zap, Star, BarChart, Clock, Database, FileQuestion, Megaphone, Milestone, Eye } from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  info: Info,
  alert: AlertCircle,
  success: CheckCircle,
  error: XCircle,
  up: ArrowUp,
  down: ArrowDown,
  calendar: Calendar,
  bell: Bell,
  flag: Flag,
  award: Award,
  target: Target,
  document: FileText,
  announcement: Megaphone,
  milestone: Milestone,
  update: Zap,
  resolution: Target,
  comment: MessageSquare,
  bookmark: Bookmark,
  star: Star,
  data: Database,
  data_release: Database,
  chart: BarChart,
  question: FileQuestion,
  deadline: Clock,
  observation: Eye
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
