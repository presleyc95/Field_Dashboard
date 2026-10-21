import { createHashRouter } from "react-router";
import { CommandCenter } from "@/pages/CommandCenter";
import { Placeholder } from "@/pages/Placeholder";
import { Settings } from "@/pages/Settings";
import { Layout } from "./Layout";

// Hash routes (#/permit/...) because GitHub Pages can't route paths on the server.
export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <CommandCenter /> },
      {
        path: "hitches",
        element: <Placeholder title="Hitches" step={4} description="Hitch schedule timeline; pick any hitch to see its totals, teams and pairings." />,
      },
      {
        path: "production",
        element: <Placeholder title="Production" step={4} description="Production by OPCO, umbrella, team, person, task and hitch, with drill-down to rows." />,
      },
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
      {
        path: "permit/:id",
        element: <Placeholder title="Permit" step={3} description="Every task, row, person and upload status for one permit." />,
      },
      {
        path: "search",
        element: <Placeholder title="Search" step={3} description="Search permits, people, OPCOs and notes. Ctrl+K opens it from anywhere." />,
      },
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
