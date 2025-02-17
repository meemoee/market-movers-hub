
import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "./ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import type { Session } from '@supabase/supabase-js';

interface ActivityItem {
  id: string;
  type: 'order' | 'research';
  created_at: string;
  details: {
    market_id?: string;
    question?: string;
    outcome?: string;
    price?: number;
    size?: number;
    analysis?: string;
    query?: string;
  };
}

export function AccountActivityList({ userId }: { userId?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchUserActivity = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const targetUserId = userId || sessionData.session?.user?.id;

    if (!targetUserId) throw new Error("No user ID provided");

    // Fetch user's orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        created_at,
        market_id,
        outcome,
        price,
        size,
        markets!inner (
          question
        )
      `)
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    // Fetch user's research
    const { data: research, error: researchError } = await supabase
      .from('web_research')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (researchError) throw researchError;

    // Combine and format the activity
    const formattedOrders: ActivityItem[] = (orders || []).map(order => ({
      id: order.id,
      type: 'order',
      created_at: order.created_at,
      details: {
        market_id: order.market_id,
        question: order.markets?.question,
        outcome: order.outcome,
        price: order.price,
        size: order.size
      }
    }));

    const formattedResearch: ActivityItem[] = (research || []).map(r => ({
      id: r.id,
      type: 'research',
      created_at: r.created_at,
      details: {
        query: r.query,
        analysis: r.analysis
      }
    }));

    // Combine all activities and sort by date
    const allActivity = [...formattedOrders, ...formattedResearch]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Filter by search query if present
    if (debouncedSearch) {
      return allActivity.filter(item => {
        const searchLower = debouncedSearch.toLowerCase();
        if (item.type === 'order') {
          return item.details.question?.toLowerCase().includes(searchLower) ||
                 item.details.outcome?.toLowerCase().includes(searchLower);
        } else {
          return item.details.query?.toLowerCase().includes(searchLower) ||
                 item.details.analysis?.toLowerCase().includes(searchLower);
        }
      });
    }

    return allActivity;
  };

  const { data: activity, isLoading, error } = useQuery({
    queryKey: ['userActivity', userId, debouncedSearch],
    queryFn: fetchUserActivity
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        Error loading activity: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="relative w-full max-w-2xl mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search activity..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 bg-background"
        />
      </div>

      <div className="space-y-4">
        {activity?.map((item) => (
          <Card key={item.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                {item.type === 'order' ? (
                  <>
                    <h3 className="font-medium">{item.details.question}</h3>
                    <p className="text-sm text-muted-foreground">
                      Bought {item.details.size} shares of {item.details.outcome} at {(item.details.price! * 100).toFixed(2)}¢
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-medium">Research: {item.details.query}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.details.analysis}
                    </p>
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </span>
            </div>
            {item.type === 'order' && item.details.market_id && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.location.href = `/market/${item.details.market_id}`}
              >
                View Market
              </Button>
            )}
          </Card>
        ))}

        {activity?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No activity found
          </div>
        )}
      </div>
    </div>
  );
}
