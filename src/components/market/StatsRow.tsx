import { ReactNode } from 'react';

interface StatsRowProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
}

export function StatsRow({ leftContent, rightContent }: StatsRowProps) {
  return (
    <div className="flex justify-between items-center h-[20px]">
      <div>{leftContent}</div>
      <div className="text-right">{rightContent}</div>
    </div>
  );
}