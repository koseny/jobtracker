import type { AccountsViewModel, PlanningViewModel } from "../accountsPlanning/accountsPlanningModel";
import type {
  CalendarMonthViewModel,
  TransactionDetailModel,
  TransactionLedgerRowModel,
} from "../calendarTransactions/calendarTransactionModel";
import type { MonthViewModel, OverviewViewModel } from "../presentation/presentationModel";

export interface HcfOperationalViewModels {
  overview: OverviewViewModel;
  month: MonthViewModel;
  calendar: CalendarMonthViewModel;
  transactionRows: TransactionLedgerRowModel[];
  transactionDetails: Record<string, TransactionDetailModel>;
  accounts: AccountsViewModel;
  planning: PlanningViewModel;
}
