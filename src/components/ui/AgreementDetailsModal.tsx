import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ServiceAgreementProjectionService } from "../../services/serviceAgreementProjections";
import { X, Calendar, DollarSign } from "lucide-react";

interface Agreement {
  agreementId: string;
  agreementName: string;
  clientId: string;
  clientName: string;
  paymentAmount: number;
  paymentFrequency: string;
  nextPaymentDate?: Date;
  contractStatus: string;
}

interface AgreementDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgreementDetailsModal({
  isOpen,
  onClose,
}: AgreementDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<Agreement[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadAgreements();
    }
  }, [isOpen]);

  const loadAgreements = async () => {
    try {
      setLoading(true);
      const projections =
        await ServiceAgreementProjectionService.getFinancialProjections(30);
      setAgreements(projections.agreements);
    } catch (error) {
      console.error("Error loading agreements:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatPaymentDate = (date?: Date) => {
    if (!date) return "N/A";
    return format(date, "MMM d, yyyy");
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
      case "inactive":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card-bg rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Service Agreement Details
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                All active service agreements with payment schedules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">
                  Loading agreements...
                </p>
              </div>
            </div>
          ) : agreements.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No service agreements found
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Total Agreements: {agreements.length}
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Expected Revenue (30d): $
                      {agreements
                        .reduce((total, agreement) => {
                          let multiplier = 1;
                          if (agreement.paymentFrequency === "quarterly") {
                            multiplier = 1; // One quarterly payment in 30 days
                          } else if (agreement.paymentFrequency === "monthly") {
                            multiplier = 1; // One monthly payment in 30 days
                          }
                          return total + agreement.paymentAmount * multiplier;
                        }, 0)
                        .toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Agreements Table */}
              <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-zinc-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Agreement
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Payment Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Frequency
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Next Payment
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="card-bg divide-y divide-gray-200 dark:divide-zinc-700">
                      {agreements.map((agreement) => (
                        <tr
                          key={agreement.agreementId}
                          className="hover:bg-gray-50 dark:hover:bg-zinc-700"
                        >
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {agreement.agreementName}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              ID: {agreement.agreementId.slice(-8)}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {agreement.clientName}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              ${agreement.paymentAmount.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white capitalize">
                              {agreement.paymentFrequency}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {formatPaymentDate(agreement.nextPaymentDate)}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                                agreement.contractStatus
                              )}`}
                            >
                              {agreement.contractStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
