
import { Link as LinkIcon } from "lucide-react";

interface CitationsProps {
  citations?: string[];
}

export function Citations({ citations }: CitationsProps) {
  if (!citations || citations.length === 0) return null;
  
  return (
    <div className="mt-2 space-y-1">
      <div className="text-xs text-muted-foreground font-medium">Sources:</div>
      <div className="flex flex-wrap gap-2">
        {citations.map((citation, index) => (
          <a
            key={index}
            href={citation}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <LinkIcon className="h-3 w-3" />
            {`[${index + 1}]`}
          </a>
        ))}
      </div>
    </div>
  );
}
