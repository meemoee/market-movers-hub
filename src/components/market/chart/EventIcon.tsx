
import { 
  Info, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  ArrowUp, 
  ArrowDown, 
  LucideIcon, 
  GitBranch, 
  Search, 
  ArrowRightCircle,
  FolderTree
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  info: Info,
  alert: AlertCircle,
  success: CheckCircle,
  error: XCircle,
  up: ArrowUp,
  down: ArrowDown,
  branch: GitBranch,
  search: Search,
  continue: ArrowRightCircle,
  tree: FolderTree
};

interface EventIconProps {
  type: string;
  size?: number;
  className?: string;
}

export function EventIcon({ type, size = 16, className }: EventIconProps) {
  const IconComponent = iconMap[type] || Info;
  return <IconComponent size={size} className={className} />;
}
