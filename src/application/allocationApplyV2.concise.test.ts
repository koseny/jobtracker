import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { applyAllocationV2 } from "./allocationApplyV2";
import { voidLinkedMovementV2 } from "./voidMovementV2";

const t = "2026-10-03T18:00:00Z";
const m = (n:number,c:"HUF"|"EUR"="HUF") => ({amountMinor:n,currencyCode:c});

function ws():CashFlowWorkspaceV2{
  const s=emptySourceStateV2();
  s.accounts=[
    {accountId:"bank",name:"Bank",accountType:"BANK",currencyCode:"HUF",active:true,createdAt:t,updatedAt:t},
    {accountId:"eur",name:"EUR",accountType:"SAVINGS",currencyCode:"EUR",active:true,createdAt:t,updatedAt:t},
  ];
  s.accountBalanceAnchors=[
    {accountBalanceAnchorId:"a1",accountId:"bank",anchorType:"INITIAL",balance:m(20_000),effectiveAt:"2026-09-01T00:00:00Z"},
    {accountBalanceAnchorId:"a2",accountId:"eur",anchorType:"INITIAL",balance:m(10_000,"EUR"),effectiveAt:"2026-09-01T00:00:00Z"},
  ];
  s.allocations=[
    {allocationId:"rent",accountId:"bank",purpose:"Rent",currencyCode:"HUF",state:"ACTIVE",createdAt:t,updatedAt:t},
    {allocationId:"trip",accountId:"eur",purpose:"Trip",currencyCode:"EUR",state:"ACTIVE",createdAt:t,updatedAt:t},
  ];
  s.allocationEvents=[
    {allocationEventId:"rr",allocationId:"rent",eventType:"RESERVE",amount:m(10_000),occurredAt:"2026-09-10T00:00:00Z"},
    {allocationEventId:"tr",allocationId:"trip",eventType:"RESERVE",amount:m(5_000,"EUR"),occurredAt:"2026-09-10T00:00:00Z"},
  ];
  s.moneyMovements=[
    {movementId:"e",movementType:"EXPENSE",lifecycleStatus:"ACTIVE",currentRevisionNo:1,createdAt:t,updatedAt:t},
    {movementId:"ee",movementType:"EXPENSE",lifecycleStatus:"ACTIVE",currentRevisionNo:1,createdAt:t,updatedAt:t},
    {movementId:"v",movementType:"EXPENSE",lifecycleStatus:"VOIDED",currentRevisionNo:1,createdAt:t,updatedAt:t,voidedAt:t},
  ];
  s.moneyMovementRevisions=[
    {movementRevisionId:"e1",movementId:"e",revisionNo:1,changedAt:t,payload:{movementType:"EXPENSE",occurredOn:"2026-10-02",amount:m(6_000),accountId:"bank",description:"Rent"}},
    {movementRevisionId:"ee1",movementId:"ee",revisionNo:1,changedAt:t,payload:{movementType:"EXPENSE",occurredOn:"2026-10-03",amount:m(3_000,"EUR"),accountId:"eur",description:"EUR expense"}},
    {movementRevisionId:"v1",movementId:"v",revisionNo:1,changedAt:t,payload:{movementType:"EXPENSE",occurredOn:"2026-10-02",amount:m(2_000),accountId:"bank",description:"Voided"}},
  ];
  s.fxRateQuotes=[{fxRateQuoteId:"fx",baseCurrencyCode:"EUR",quoteCurrencyCode:"HUF",numerator:400,denominator:100,effectiveMonth:"2026-10"}];
  return {workspaceId:"home",ownerPartitionId:"owner-a",schemaVersion:2,reportingCurrencyCode:"HUF",revision:1,createdAt:t,updatedAt:t,sourceState:s};
}

const command=(rev=1)=>({
  ownerPartitionId:"owner-a",workspaceId:"home",expectedRevision:rev,changedAt:t,
  allocationId:"rent",allocationEventId:"ap1",movementId:"e",amount:m(3_000),
  occurredAt:"2026-10-03T12:00:00Z",note:" reserve use "
});

const repos=[
  ["memory",()=>new InMemoryCashFlowRepositoryV2()],
  ["indexeddb",()=>new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-apply-small",new IDBFactory())],
] as const;

describe.each(repos)("APPLY %s",(_name,make)=>{
  it("consumes reserve without duplicating expense",async()=>{
    const repo=make(),before=ws(); await repo.save("owner-a",before,null);
    const result=await applyAllocationV2(repo,command());
    expect(result.sourceState.moneyMovements).toEqual(before.sourceState.moneyMovements);
    expect(result.sourceState.moneyMovementRevisions).toEqual(before.sourceState.moneyMovementRevisions);
    expect(result.sourceState.allocationEvents.at(-1)).toMatchObject({eventType:"APPLY",movementId:"e",amount:m(3_000),note:"reserve use"});
    const view=project(result,"2026-10","EN");
    expect(view.overview.kpis.find(x=>x.id==="spending")?.value).toEqual(m(18_000));
    expect(view.accounts.allocations.find(x=>x.allocationId==="rent")?.remaining).toEqual(m(7_000));
  });

  it("allows partial APPLY only up to expense and reserve coverage",async()=>{
    const repo=make(); await repo.save("owner-a",ws(),null);
    await applyAllocationV2(repo,command());
    const second=command(2); second.allocationEventId="ap2"; second.amount=m(3_000);
    const ok=await applyAllocationV2(repo,second);
    expect(project(ok,"2026-10","EN").accounts.allocations.find(x=>x.allocationId==="rent")?.remaining).toEqual(m(4_000));
    const third=command(3); third.allocationEventId="ap3"; third.amount=m(1);
    await expect(applyAllocationV2(repo,third)).rejects.toThrow("Aggregate APPLY exceeds");
  });

  it("supports native EUR APPLY without inferred FX",async()=>{
    const repo=make(); await repo.save("owner-a",ws(),null);
    const c=command(); c.allocationId="trip"; c.allocationEventId="eap"; c.movementId="ee"; c.amount=m(2_000,"EUR");
    const result=await applyAllocationV2(repo,c);
    expect(project(result,"2026-10","EN").accounts.allocations.find(x=>x.allocationId==="trip")?.remaining).toEqual(m(3_000,"EUR"));
  });

  it("rejects incompatible, voided, excessive and malformed requests without persistence",async()=>{
    for(const mutate of [
      (c:any)=>{c.movementId="v";},
      (c:any)=>{c.amount.currencyCode="EUR";},
      (c:any)=>{c.amount.amountMinor=0;},
      (c:any)=>{c.occurredAt="2026-02-30T00:00:00Z";},
    ]){
      const repo=make(),source=ws(); await repo.save("owner-a",source,null);
      const save=vi.spyOn(repo,"save"); const c=command(); mutate(c);
      await expect(applyAllocationV2(repo,c)).rejects.toBeTruthy();
      expect(save).not.toHaveBeenCalled();
    }
  });

  it("rejects a backdated APPLY that would make later reserve coverage negative",async()=>{
    const repo=make(),source=ws();
    source.sourceState.moneyMovementRevisions[0].payload={movementType:"EXPENSE",occurredOn:"2026-10-02",amount:m(20_000),accountId:"bank",description:"Rent"};
    source.sourceState.allocationEvents.push({allocationEventId:"rel",allocationId:"rent",eventType:"RELEASE",amount:m(8_000),occurredAt:"2026-10-05T00:00:00Z"});
    await repo.save("owner-a",source,null);
    await expect(applyAllocationV2(repo,command())).rejects.toThrow("APPLY exceeds reserve");
  });

  it("keeps VOIDed APPLY history but restores active reserve consumption",async()=>{
    const repo=make(); await repo.save("owner-a",ws(),null);
    await applyAllocationV2(repo,command());
    const result=await voidLinkedMovementV2(repo,{ownerPartitionId:"owner-a",workspaceId:"home",expectedRevision:2,changedAt:"2026-10-04T18:00:00Z",movementId:"e"});
    expect(result.sourceState.allocationEvents.find(x=>x.allocationEventId==="ap1")?.eventType).toBe("APPLY");
    expect(project(result,"2026-10","EN").accounts.allocations.find(x=>x.allocationId==="rent")?.remaining).toEqual(m(10_000));
  });

  it("rejects stale revision",async()=>{
    const repo=make(); await repo.save("owner-a",ws(),null); await applyAllocationV2(repo,command());
    const c=command(); c.allocationEventId="late";
    await expect(applyAllocationV2(repo,c)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
  });
});
