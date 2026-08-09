"use client";

type NavigationProps = {
  currentPage: "home" | "exercises" | "practice" | "statistics";
  onNavigate: (
    page: "home" | "exercises" | "practice" | "statistics"
  ) => void;
};

export default function Navigation({
  currentPage,
  onNavigate,
}: NavigationProps) {
  const pages = [
    { id: "home", label: "Home" },
    { id: "exercises", label: "Exercises" },
    { id: "practice", label: "Practice" },
    { id: "statistics", label: "Statistics" },
  ] as const;

  return (
    <nav className="mb-8 flex gap-3">
      {pages.map((page) => (
        <button
          key={page.id}
          onClick={() => onNavigate(page.id)}
          className={`rounded-lg px-5 py-2 font-medium transition ${
            currentPage === page.id
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {page.label}
        </button>
      ))}
    </nav>
  );
}