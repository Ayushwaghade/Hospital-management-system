"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, 
  SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset 
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, Users, Calendar, Monitor, Bed, BrainCircuit, 
  Settings, LogOut, Bell, User as UserIcon, Stethoscope // <-- Added Stethoscope icon
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

// Added 'allowedRoles' to control who sees what
const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", allowedRoles: ["admin", "staff", "patient"] },
  { icon: Users, label: "OPD Queue", href: "/opd-queue", allowedRoles: ["admin", "staff"] },
  { icon: Calendar, label: "Appointment Booking", href: "/appointment-booking", allowedRoles: ["patient", "admin", "staff"] },
  { icon: Monitor, label: "Waiting Room", href: "/waiting-room", allowedRoles: ["patient", "admin", "staff"] },
  { icon: Bed, label: "Bed Availability", href: "/bed-availability", allowedRoles: ["admin", "staff"] },
  { icon: BrainCircuit, label: "LOS Prediction", href: "/los-prediction", allowedRoles: ["admin", "staff"] },
  { icon: Stethoscope, label: "Doctor Management", href: "/doctor-management", allowedRoles: ["admin", "staff"] }, // <-- NEW ROUTE ADDED HERE
  { icon: Stethoscope, label: "Patient Management", href: "/patient-management", allowedRoles: ["admin", "staff"] }, // <-- NEW ROUTE ADDED HERE
  { icon: Users, label: "Staff Management", href: "/staff-management", allowedRoles: ["admin"] },
  { icon: Settings, label: "Settings", href: "/settings", allowedRoles: ["admin", "staff", "patient"] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  // State for user session
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const storedRole = localStorage.getItem("role");
    const storedName = localStorage.getItem("name");

    if (!storedRole) {
      router.push("/login"); // Kick to login if not authenticated
    } else {
      setRole(storedRole);
      setName(storedName);
    }
  }, [router]);

  // Handle Logout properly
  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  // Prevent hydration mismatch and rendering before auth check
  if (!isMounted || !role) return null; 

  // Filter items based on the user's role
  const filteredItems = sidebarItems.filter(item => item.allowedRoles.includes(role));

  // Get initials for Avatar
  const initials = name ? name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2) : "U";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader className="h-16 flex items-center px-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold">S</div>
              <span className="font-headline font-bold text-lg group-data-[collapsible=icon]:hidden">SmartHospital</span>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <SidebarMenu>
              {/* Map only the filtered items */}
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={handleLogout} 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <LogOut />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col">
          <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-40">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <div className="h-4 w-px bg-border" />
              <h1 className="font-medium text-muted-foreground capitalize">
                {pathname.split("/").pop()?.replace("-", " ") || "Dashboard"}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${name}`} alt={name || "User"} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      {/* Dynamic Name and Role mapping */}
                      <p className="text-sm font-medium leading-none">{name}</p>
                      <p className="text-xs leading-none text-muted-foreground capitalize">{role} Account</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Settings</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Attached the handleLogout function here too */}
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer focus:bg-destructive/10">
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 p-6 overflow-y-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}