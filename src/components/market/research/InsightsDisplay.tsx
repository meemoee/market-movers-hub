
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export interface InsightsDisplayProps {
  areasForResearch: string[]
  supportingPoints: string[]
  negativePoints: string[]
  reasoning: string
  probability?: string
}

export function InsightsDisplay({
  areasForResearch,
  supportingPoints,
  negativePoints,
  reasoning,
  probability
}: InsightsDisplayProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Research Insights</CardTitle>
          {probability && (
            <Badge variant="outline" className="bg-primary/10 border-primary/20">
              Suggested Probability: {probability}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {reasoning && (
          <div>
            <h4 className="text-sm font-medium mb-1">Analysis</h4>
            <p className="text-sm text-muted-foreground">{reasoning}</p>
          </div>
        )}
        
        {supportingPoints.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-1">Supporting Evidence</h4>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {supportingPoints.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}
        
        {negativePoints.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-1">Contradicting Evidence</h4>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {negativePoints.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}
        
        {areasForResearch.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-1">Areas for Further Research</h4>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {areasForResearch.map((area, idx) => (
                <li key={idx}>{area}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
