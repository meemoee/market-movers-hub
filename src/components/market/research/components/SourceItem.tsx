
import { FileText, Globe } from "lucide-react"
import { getFaviconUrl } from "@/utils/favicon"

interface SourceItemProps {
  url: string;
  title?: string;
}

export function SourceItem({ url, title }: SourceItemProps) {
  return (
    <div className="mb-4 last:mb-0 p-3 bg-accent/5 rounded-lg max-w-full">
      <div className="flex items-center gap-2 min-w-0">
        <img 
          src={getFaviconUrl(url)} 
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => {
            const IconComponent = title ? FileText : Globe;
            const svgString = `data:image/svg+xml,${encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
                title 
                  ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>'
                  : '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>'
              }</svg>`
            )}`;
            e.currentTarget.src = svgString;
          }}
        />
        <h4 className="text-sm font-medium truncate min-w-0">
          {title || new URL(url).hostname}
        </h4>
      </div>
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-xs text-blue-500 hover:underline block mt-1 break-all line-clamp-2"
      >
        {url}
      </a>
    </div>
  )
}
