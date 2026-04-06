import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

interface HeaderProps {
  month: number;
  rowCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const Header = ({ month, rowCount, isRefreshing, onRefresh }: HeaderProps) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
          {MONTHS[month - 1]} Prayer Times
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {rowCount} days loaded — click any row to edit
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="gap-2"
      >
        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        Refresh
      </Button>
    </div>
  );
};

export default Header;
