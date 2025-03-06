
import { ContentContainer } from "./components/ContentContainer"
import { SourceItem } from "./components/SourceItem"

interface SitePreviewListProps {
  results: Array<{
    url: string
    title?: string
  }>
}

export function SitePreviewList({ results }: SitePreviewListProps) {
  if (!results.length) return null;

  return (
    <div className="w-full">
      <ContentContainer>
        <div className="mb-2 text-sm text-muted-foreground">
          {results.length} {results.length === 1 ? 'source' : 'sources'} collected
        </div>
        <div className="space-y-2 w-full">
          {results.map((result, index) => (
            <SourceItem key={index} {...result} />
          ))}
        </div>
      </ContentContainer>
    </div>
  )
}
