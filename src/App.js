import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import React, { useEffect, useState } from "react";
import TimeAgo from "timeago-react";
import SocialAccount from "./components/SocialAccount/SocialAccount";
import { keysToCamel } from "./data/utils";
import TokenBalance from "./components/token/TokenBalance";
import Big from "big.js";
import TokenBadge from "./components/token/TokenBadge";
import LinkToAccountPage from "./images/link_to_account_page.png";

let globalIndex = 0;

const ContractId = "contract.main.burrow.near";
const DefaultTokenId = "token.burrow.near";

const defaultBurrowFilter = {
  status: "SUCCESS",
  account_id: ContractId,
  event: {
    standard: "burrow",
  },
};
let burrowFilter = JSON.parse(JSON.stringify(defaultBurrowFilter));

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
        fetch_past_events: 50,
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
    time: new Date(parseFloat(event.blockTimestamp) / 1e6),
    accountId: event.event.data[0].accountId,
    event: event.event.event,
    data: event.event.data[0],
  };
}

function App() {
  const [burrowActions, setBurrowActions] = useState([]);

  const urlParams = new URLSearchParams(window.location.hash.replace("#", "?"));
  const [filterAccountId, setFilterAccountId] = useState(
    urlParams.get("account") || null
  );

  useEffect(() => {
    const processEvents = (events) => {
      events = events.map(keysToCamel).flatMap(processEvent);
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
        return newActions.slice(0, 250);
      });
    };

    listenToBurrow(processEvents);
  }, []);

  useEffect(() => {
    if (filterAccountId === null) {
      return;
    }
    burrowFilter = JSON.parse(JSON.stringify(defaultBurrowFilter));
    if (filterAccountId) {
      burrowFilter.event.data = [{ account_id: filterAccountId }];
    }
    if (filterTypingTimeout) {
      clearTimeout(filterTypingTimeout);
      filterTypingTimeout = null;
    }
    const accountId = filterAccountId;
    filterTypingTimeout = setTimeout(() => {
      if (accountId === "") {
        window.location.href = "/#";
      } else {
        window.location.href = `/#account=${accountId}`;
      }
      if (ws) {
        setBurrowActions([]);
        ws.close();
      }
    }, 500);
  }, [filterAccountId]);

  const showAction = (action) => {
    switch (action.event) {
      case "liquidate":
        return (
          <>
            <div>
              Liquidation of{" "}
              <a
                href={`/#account=${action.data.liquidationAccountId}`}
                onClick={() =>
                  setFilterAccountId(action.data.liquidationAccountId)
                }
              >
                {action.data.liquidationAccountId}
              </a>
            </div>
            <div>
              Profit: $
              {(
                parseFloat(action.data.collateralSum) -
                parseFloat(action.data.repaidSum)
              ).toFixed(2)}
            </div>
          </>
        );
      default:
        return action.event;
    }
  };

  return (
    <div>
      <a href="/#" onClick={() => setFilterAccountId("")}>
        <h1>Live Burrow feed</h1>
      </a>
      <div>
        <label htmlFor="accountIdFilter">Filter by account ID:</label>
        <input
          className="form-control"
          type="text"
          id="accountIdFilter"
          placeholder="Account ID"
          value={filterAccountId || ""}
          onChange={(e) => setFilterAccountId(e.target.value)}
        />
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
                    <SocialAccount accountId={action.accountId} clickable />
                    <a
                      href={`/#account=${action.accountId}`}
                      onClick={() => setFilterAccountId(action.accountId)}
                    >
                      <img
                        src={LinkToAccountPage}
                        title={`Filter ${action.accountId} actions`}
                        alt={`Filter ${action.accountId} actions`}
                        style={{ paddingLeft: "5px" }}
                      />
                    </a>
                  </td>
                  <td className="col-2">{showAction(action)}</td>
                  <td className="col-2 text-end">
                    <TokenBalance
                      clickable
                      tokenAccountId={tokenAccountId}
                      adjustForBurrow
                      balance={Big(action.data?.amount || 0)}
                    />
                  </td>
                  <td className="col-4">
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
