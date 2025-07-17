import { useState, useEffect } from 'react';
import { ChevronDown, X, Tag, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TagData {
  name: string;
  count: number;
}

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function TagFilter({ selectedTags, onTagsChange, disabled = false }: TagFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableTags, setAvailableTags] = useState<TagData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Default top tags based on your successful data collection
  const defaultTags: TagData[] = [
    { name: 'Sports', count: 1505 },
    { name: 'Politics', count: 1052 },
    { name: 'World', count: 603 },
    { name: 'Global Elections', count: 425 },
    { name: 'Trump', count: 409 },
    { name: 'Trump Presidency', count: 394 },
    { name: 'NFL', count: 350 },
    { name: 'Crypto', count: 316 },
    { name: 'Awards', count: 316 },
    { name: 'NBA', count: 268 },
    { name: 'Games', count: 200 },
    { name: 'Culture', count: 180 },
    { name: 'Technology', count: 150 },
    { name: 'Entertainment', count: 120 },
  ];

  // Fetch available tags from Supabase
  useEffect(() => {
    const fetchAvailableTags = async () => {
      setIsLoading(true);
      try {
        // Query to get tag counts from your markets table
        const { data, error } = await supabase.rpc('get_tag_counts');
        
        if (error) {
          console.warn('Error fetching tags, using defaults:', error);
          setAvailableTags(defaultTags);
        } else if (data && data.length > 0) {
          const processedTags: TagData[] = data.map((row) => ({
            name: row.tag_name,
            count: row.tag_count
          }));
          setAvailableTags(processedTags);
        } else {
          setAvailableTags(defaultTags);
        }
      } catch (error) {
        console.warn('Error fetching tags, using defaults:', error);
        setAvailableTags(defaultTags);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailableTags();
  }, []);

  const filteredTags = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTagToggle = (tagName: string) => {
    const newSelectedTags = selectedTags.includes(tagName)
      ? selectedTags.filter(t => t !== tagName)
      : [...selectedTags, tagName];
    onTagsChange(newSelectedTags);
  };

  const clearAllTags = () => {
    onTagsChange([]);
  };

  const getTagColor = (tagName: string) => {
    const colors: Record<string, string> = {
      'Sports': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      'Politics': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      'Crypto': 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
      'World': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
      'NFL': 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
      'NBA': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
      'Trump': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
      'Games': 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    };
    return colors[tagName] || 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-700';
  };

  return (
    <div className="relative">
      {/* Tag Filter Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Filter size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium">Tags</span>
        {selectedTags.length > 0 && (
          <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
            {selectedTags.length}
          </span>
        )}
        <ChevronDown 
          size={14} 
          className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Selected Tags Display */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
            >
              <Tag size={10} />
              {tag}
              <button
                onClick={() => handleTagToggle(tag)}
                className="hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            onClick={clearAllTags}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl z-50">
          {/* Header with search */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Filter by Tags</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-accent/20 rounded-md"
              >
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Search tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Tags List */}
          <div className="max-h-80 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <div className="text-sm text-muted-foreground">Loading tags...</div>
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="flex items-center justify-center p-4">
                <div className="text-sm text-muted-foreground">No tags found</div>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTags.slice(0, 50).map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.name}
                      onClick={() => handleTagToggle(tag.name)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 text-primary border border-primary/20' 
                          : 'hover:bg-accent/10 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Tag size={12} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                        <span className="text-sm font-medium">{tag.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {tag.count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {selectedTags.length > 0 && (
            <div className="p-3 border-t border-border">
              <button
                onClick={clearAllTags}
                className="w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent/10 transition-colors"
              >
                Clear All Tags ({selectedTags.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}