import { ReactNode, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  Users,
  Package,
  FileText,
  Home,
  HelpCircle,
  LogOut,
  Menu,
  X,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type LayoutProps = {
  children: ReactNode;
};

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-blue-700 text-slate-900">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:fixed md:flex left-0 top-0 h-screen w-64 bg-blue-700 text-white flex-col z-50">
        {/* topo: logo/título */}
        <div className="px-6 py-5 border-b border-blue-500 flex items-center gap-3">
          {/* coloque sua logo aqui se tiver */}
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight">AquaHub</span>
            <span className="text-xs text-blue-200">Painel de gestão</span>
          </div>
        </div>

        {/* navegação principal */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <Home size={16} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/calendario"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <Calendar size={16} />
            <span>Calendário</span>
          </NavLink>

          <NavLink
            to="/Eventos"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <FileText size={16} />
            <span>Serviços</span>
          </NavLink>

          <NavLink
            to="/pagamentos"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <DollarSign size={16} />
            <span>Pagamentos</span>
          </NavLink>

          {/* <NavLink
            to="/propostas"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <Package size={16} />
            <span>Propostas</span>
          </NavLink> */}

          <NavLink
            to="/clientes"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <Users size={16} />
            <span>Clientes</span>
          </NavLink>

          {/* <NavLink
            to="/relatorios"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <FileText size={16} />
            <span>Relatórios</span>
          </NavLink> */}
        </nav>

        {/* rodapé: Conta / Ajuda / Sair */}
        <div className="border-t border-blue-600 px-3 py-3 text-sm space-y-1">
          {/* <NavLink
            to="/ajuda"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-600 hover:text-white"
              }`
            }
          >
            <HelpCircle size={16} />
            <span>Ajuda</span>
          </NavLink> */}

          <NavLink
            to="/logout"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-red-50 text-red-700 shadow-sm"
                  : "text-red-100 hover:bg-red-600 hover:text-white"
              }`
            }
            onClick={async (e) => {
              e.preventDefault();
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut size={16} />
            <span>Sair</span>
          </NavLink>
        </div>
      </aside>

      {/* SIDEBAR MOBILE */}
      {mobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeMobileMenu}
          />

          {/* Menu lateral */}
          <aside className="fixed left-0 top-0 h-screen w-64 bg-blue-700 text-white flex flex-col z-50 md:hidden">
            <div className="px-6 py-5 border-b border-blue-500 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight">Gestão Piscinas</span>
                <span className="text-xs text-blue-200">Painel de gestão</span>
              </div>
              <button onClick={closeMobileMenu} className="text-white">
                <X size={24} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto text-sm">
              <NavLink
                to="/"
                end
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <Home size={16} />
                <span>Dashboard</span>
              </NavLink>

              <NavLink
                to="/calendario"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <Calendar size={16} />
                <span>Calendário</span>
              </NavLink>

              <NavLink
                to="/Eventos"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <FileText size={16} />
                <span>Serviços</span>
              </NavLink>

              <NavLink
                to="/pagamentos"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <DollarSign size={16} />
                <span>Pagamentos</span>
              </NavLink>

              {/* <NavLink
                to="/propostas"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <Package size={16} />
                <span>Propostas</span>
              </NavLink> */}

              <NavLink
                to="/clientes"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <Users size={16} />
                <span>Clientes</span>
              </NavLink>

              {/* <NavLink
                to="/relatorios"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <FileText size={16} />
                <span>Relatórios</span>
              </NavLink> */}
            </nav>

            <div className="border-t border-blue-600 px-3 py-3 text-sm space-y-1">
              {/* <NavLink
                to="/ajuda"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-blue-100 hover:bg-blue-600 hover:text-white"
                  }`
                }
              >
                <HelpCircle size={16} />
                <span>Ajuda</span>
              </NavLink> */}

              <button
                onClick={async () => {
                  closeMobileMenu();
                  await signOut();
                  navigate("/login", { replace: true });
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2 transition text-red-100 hover:bg-red-600 hover:text-white w-full"
              >
                <LogOut size={16} />
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="min-h-screen bg-slate-50 md:ml-64 flex flex-col">
        <header className="h-14 md:h-16 border-b bg-white flex items-center justify-between px-4 md:px-8">
          {/* Botão Menu Mobile */}
          <button
            className="md:hidden text-slate-700"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>

          <span className="text-xs md:text-sm text-slate-500 hidden md:block">
            Gestão Piscinas /{" "}
            <span className="font-semibold text-slate-800">Painel</span>
          </span>

          {user && (
            <span className="text-[10px] md:text-xs text-slate-500 truncate max-w-[150px] md:max-w-none">
              <span className="hidden sm:inline">Logado como </span>
              <span className="font-medium">{user.email}</span>
            </span>
          )}
        </header>

        <div className="flex-1 px-3 md:px-6 lg:px-10 py-4 md:py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
};