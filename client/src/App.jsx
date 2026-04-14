import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PlayerJoin from "./PlayerJoin.jsx";
import PlayerGame from "./PlayerGame.jsx";
import HostDashboard from "./HostDashboard.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PlayerJoin />} />
        <Route path="/game" element={<PlayerGame />} />
        <Route path="/host" element={<HostDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
