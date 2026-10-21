import { createHashRouter } from "react-router";
import { CommandCenter } from "@/pages/CommandCenter";
import { Hitches } from "@/pages/Hitches";
import { People } from "@/pages/People";
import { PersonProfile } from "@/pages/PersonProfile";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { Projects } from "@/pages/Projects";
import { Teams } from "@/pages/Teams";
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
      { path: "projects", element: <Projects /> },
      { path: "projects/umbrella/:opco", element: <ProjectDetail umbrella /> },
      { path: "projects/:opco", element: <ProjectDetail /> },
      { path: "teams", element: <Teams /> },
      { path: "people", element: <People /> },
      { path: "people/:name", element: <PersonProfile /> },
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
