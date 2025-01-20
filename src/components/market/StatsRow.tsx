import { ReactNode } from 'react';

interface StatsRowProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
}

export function StatsRow({ leftContent, rightContent }: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 items-center h-[20px]">
      <div>{leftContent}</div>
      <div className="justify-self-end whitespace-nowrap">{rightContent}</div>
    </div>
  );
}