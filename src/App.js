import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import { useEffect, useState } from "react";
import TimeAgo from "timeago-react";
import SocialAccount from "./components/SocialAccount/SocialAccount";
import { keysToCamel } from "./data/utils";
import TokenBalance from "./components/token/TokenBalance";
import Big from "big.js";
import TokenBadge from "./components/token/TokenBadge";

let globalIndex = 0;

const ContractId = "contract.main.burrow.near";
const DefaultTokenId = "token.burrow.near";

const burrowFilter = {
  status: "SUCCESS",
  account_id: ContractId,
  event: {
    standard: "burrow",
  },
};

let reconnectTimeout = null;

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

  const ws = new WebSocket("wss://events.near.stream/ws");

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
    console.log(`WS Connection has been closed`);
    scheduleReconnect(1);
  };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    processEvents(data.events);
  };
  ws.onerror = (err) => {
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

  return (
    <div>
      <h1>Live Burrow feed</h1>
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
                  </td>
                  <td className="col-2">{action.event}</td>
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
