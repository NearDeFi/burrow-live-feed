import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import React, { useEffect, useState } from "react";
import TimeAgo from "timeago-react";
import SocialAccount from "./components/SocialAccount/SocialAccount";
import TokenBalance from "./components/token/TokenBalance";
import Big from "big.js";
import TokenBadge from "./components/token/TokenBadge";
import MutedDecimals from "./components/common/MutedDecimals";

let globalIndex = 0;

const ContractId = "contract.main.burrow.near";
const DefaultTokenId = "token.burrow.near";

const defaultBurrowFilter = {
  status: "SUCCESS",
  account_id: ContractId,
  standard: "burrow",
};

function makeFilter(filterAccountId, filterLiquidations) {
  if (filterAccountId) {
    let filter = [
      makeFilter(null, filterLiquidations),
      makeFilter(null, filterLiquidations),
    ];
    filter[0].data_account_id = filterAccountId;
    filter[1].data_liquidation_account_id = filterAccountId;
    return filter;
  } else {
    let filter = JSON.parse(JSON.stringify(defaultBurrowFilter));
    if (filterLiquidations) {
      filter.event = "liquidate";
    }
    return filter;
  }
}

let burrowFilter = makeFilter();

let reconnectTimeout = null;
let ws = null;

let filterTypingTimeout = null;

function listenToBurrow(processEvents) {
  const scheduleReconnect = (timeOut) => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    reconnectTimeout = setTimeout(() => {
      listenToBurrow(processEvents);
    }, timeOut);
  };

  if (document.hidden) {
    scheduleReconnect(1000);
    return;
  }

  if (ws) {
    ws.close();
    return;
  }

  ws = new WebSocket("wss://events.near.stream/ws");

  ws.onopen = () => {
    console.log(`Connection to WS has been established`);
    ws.send(
      JSON.stringify({
        secret: "brrr",
        filter: burrowFilter,
        fetch_past_events: 500,
      })
    );
  };
  ws.onclose = () => {
    ws = null;
    console.log(`WS Connection has been closed`);
    scheduleReconnect(1);
  };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    processEvents(data.events);
  };
  ws.onerror = (err) => {
    ws = null;
    console.log("WebSocket error", err);
  };
}

function processEvent(event) {
  return {
    index: globalIndex++,
    time: new Date(event.block_timestamp * 1000),
    accountId: event.data_account_id,
    event: event.event,
    data: {
      accountId: event.data_account_id,
      tokenId: event.data_token_id,
      liquidationAccountId: event.data_liquidation_account_id,
      amount: event.data_amount,
    },
  };
}

function App() {
  const [burrowActions, setBurrowActions] = useState([]);

  const urlParams = new URLSearchParams(window.location.hash.replace("#", "?"));
  const [filterAccountId, setFilterAccountId] = useState(
    urlParams.get("account") || null
  );
  const [filterLiquidations, setFilterLiquidations] = useState(null);

  useEffect(() => {
    const processEvents = (events) => {
      events = events.flatMap(processEvent);
      events.reverse();

      setBurrowActions((prevState) => {
        const newActions = [
          ...events.filter(
            (event) =>
              prevState.length === 0 ||
              event.time.getTime() > prevState[0].time.getTime()
          ),
          ...prevState,
        ];
        return newActions.slice(0, 500);
      });
    };

    listenToBurrow(processEvents);
  }, []);

  useEffect(() => {
    if (filterAccountId === null && filterLiquidations === null) {
      return;
    }
    burrowFilter = makeFilter(filterAccountId, filterLiquidations);
    if (filterTypingTimeout) {
      clearTimeout(filterTypingTimeout);
      filterTypingTimeout = null;
    }
    const accountId = filterAccountId;
    filterTypingTimeout = setTimeout(() => {
      if (!accountId) {
        window.location.href = "/#";
      } else {
        window.location.href = `/#account=${accountId}`;
      }
      if (ws) {
        setBurrowActions([]);
        ws.close();
      }
    }, 500);
  }, [filterAccountId, filterLiquidations]);

  const showAction = (action) => {
    switch (action.event) {
      case "liquidate":
        return (
          <>
            <div>
              Liquidation!
              <br />
              <SocialAccount
                accountId={action.data.liquidationAccountId}
                clickable
                filterLink={setFilterAccountId}
              />
            </div>
          </>
        );
      case "force_close":
        return (
          <>
            <div>
              Force closing! Protocol loss:{" "}
              <span className="font-monospace fw-bold">
                <span className="text-secondary">$</span>
                <MutedDecimals
                  value={(
                    parseFloat(action.data.repaidSum) -
                    parseFloat(action.data.collateralSum)
                  ).toFixed(2)}
                />
              </span>
              {}
              :
              <br />
              <SocialAccount
                accountId={action.data.liquidationAccountId}
                clickable
                filterLink={setFilterAccountId}
              />
            </div>
          </>
        );
      default:
        return action.event;
    }
  };

  return (
    <div className="container">
      <a href="/#" onClick={() => setFilterAccountId("")}>
        <h1>Live Burrow feed</h1>
      </a>
      <div className="form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="liquidationsFilter"
          value={filterLiquidations || ""}
          onChange={(e) => setFilterLiquidations(e.currentTarget.checked)}
        />
        <label className="form-check-label" htmlFor="liquidationsFilter">
          Liquidations only
        </label>
      </div>
      <div className="row justify-content-md-center">
        <div className="col-auto">
          <label className="col-form-label" htmlFor="accountIdFilter">
            Filter by account ID:
          </label>
        </div>
        <div className="col">
          <input
            className="form-control"
            type="text"
            id="accountIdFilter"
            placeholder="Account ID"
            value={filterAccountId || ""}
            onChange={(e) => setFilterAccountId(e.target.value)}
          />
        </div>
      </div>
      <div className="table-responsive">
        <table className="table align-middle">
          <tbody>
            {burrowActions.map((action) => {
              const tokenAccountId = action.data?.tokenId || DefaultTokenId;
              return (
                <tr key={action.index}>
                  <td className="col-1">
                    <TimeAgo datetime={action.time} />
                  </td>
                  <td className="col-3">
                    <SocialAccount
                      accountId={action.accountId}
                      clickable
                      filterLink={setFilterAccountId}
                    />
                  </td>
                  <td className="col-3">{showAction(action)}</td>
                  <td className="col-1 text-end">
                    <TokenBalance
                      clickable
                      tokenAccountId={tokenAccountId}
                      adjustForBurrow
                      balance={Big(action.data?.amount || 0)}
                    />
                  </td>
                  <td className="col-3">
                    <TokenBadge tokenAccountId={tokenAccountId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
