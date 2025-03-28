
import { getFaviconUrl } from "@/utils/favicon"
import { FileText, Globe } from "lucide-react"

interface FaviconDisplayProps {
  url: string;
  title?: string;
}

export function FaviconDisplay({ url, title }: FaviconDisplayProps) {
  return (
    <img 
      src={getFaviconUrl(url)} 
      alt=""
      className="w-4 h-4 flex-shrink-0"
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
  );
}
