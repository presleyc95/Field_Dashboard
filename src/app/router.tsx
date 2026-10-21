import { createHashRouter } from "react-router";
import { CommandCenter } from "@/pages/CommandCenter";
import { Hitches } from "@/pages/Hitches";
import { Production } from "@/pages/Production";
import { Permit } from "@/pages/Permit";
import { Placeholder } from "@/pages/Placeholder";
import { Search } from "@/pages/Search";
import { Settings } from "@/pages/Settings";
import { Layout } from "./Layout";
import { RouteError } from "./RouteError";

// Hash routes (#/permit/...) because GitHub Pages can't route paths on the server.
export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <CommandCenter /> },
      { path: "hitches", element: <Hitches /> },
      { path: "production", element: <Production /> },
      {
        path: "projects/:opco?",
        element: <Placeholder title="Projects" step={5} description="Progress per OPCO, burn-down against the scope sheets, projected finish and due-date risk." />,
      },
      {
        path: "teams",
        element: <Placeholder title="Teams" step={5} description="Current pairs and team totals for the selected hitch." />,
      },
      {
        path: "people/:name?",
        element: <Placeholder title="People" step={5} description="Tech profiles: most-worked OPCO, average poles per day, partners, task mix and trends." />,
      },
      { path: "permit/:id", element: <Permit /> },
      { path: "search", element: <Search /> },
      {
        path: "queue",
        element: <Placeholder title="Upload Queue" step={7} description="Completed KATAPULT, PCI, GO BACKS and POWER PCI jobs not yet marked uploaded." />,
      },
      {
        path: "quality",
        element: <Placeholder title="Data Quality" step={6} description="Everything the clean-up fixed or flagged, with Excel row numbers." />,
      },
      { path: "settings", element: <Settings /> },
      {
        path: "*",
        element: <Placeholder title="Not found" step={1} description="That page doesn't exist." />,
      },
    ],
  },
]);
