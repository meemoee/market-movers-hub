import { ReactNode } from 'react';

interface StatsRowProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
}

export function StatsRow({ leftContent, rightContent }: StatsRowProps) {
  return (
    <div className="flex justify-between items-center h-[20px]">
      <div className="flex-1">{leftContent}</div>
      <div className="flex-1 text-right">{rightContent}</div>
    </div>
  );
}