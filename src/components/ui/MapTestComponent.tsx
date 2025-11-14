import { useState } from "react";
import EntryDetailsMap from "./EntryDetailsMap";

export default function MapTestComponent() {
  const [testCase, setTestCase] = useState(1);

  // Test case 1: Valid coordinates
  const testData1 = {
    clockInCoordinates: {
      latitude: 41.4993,
      longitude: -81.6944,
    },
    clockOutCoordinates: {
      latitude: 41.501,
      longitude: -81.693,
    },
    clockInTime: new Date(),
    clockOutTime: new Date(),
  };

  // Test case 2: Only clock in
  const testData2 = {
    clockInCoordinates: {
      latitude: 41.4993,
      longitude: -81.6944,
    },
    clockOutCoordinates: null,
    clockInTime: new Date(),
    clockOutTime: null,
  };

  // Test case 3: No coordinates
  const testData3 = {
    clockInCoordinates: null,
    clockOutCoordinates: null,
    clockInTime: null,
    clockOutTime: null,
  };

  // Test case 4: Invalid coordinates
  const testData4 = {
    clockInCoordinates: null, // Set to null to test invalid case
    clockOutCoordinates: null,
    clockInTime: new Date(),
    clockOutTime: null,
  };

  const getCurrentTestData = () => {
    switch (testCase) {
      case 1:
        return testData1;
      case 2:
        return testData2;
      case 3:
        return testData3;
      case 4:
        return testData4;
      default:
        return testData1;
    }
  };

  const testData = getCurrentTestData();

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">Map Loading Test Component</h2>

      <div className="flex gap-2">
        <button
          onClick={() => setTestCase(1)}
          className={`px-3 py-1 rounded ${
            testCase === 1 ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Test 1: Valid Coordinates
        </button>
        <button
          onClick={() => setTestCase(2)}
          className={`px-3 py-1 rounded ${
            testCase === 2 ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Test 2: Only Clock In
        </button>
        <button
          onClick={() => setTestCase(3)}
          className={`px-3 py-1 rounded ${
            testCase === 3 ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Test 3: No Coordinates
        </button>
        <button
          onClick={() => setTestCase(4)}
          className={`px-3 py-1 rounded ${
            testCase === 4 ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Test 4: Invalid Coordinates
        </button>
      </div>

      <div className="border p-4 rounded">
        <h3 className="font-medium mb-2">Current Test Data:</h3>
        <pre className="bg-gray-100 p-2 rounded text-sm">
          {JSON.stringify(testData, null, 2)}
        </pre>
      </div>

      <div className="border p-4 rounded">
        <h3 className="font-medium mb-2">Map Component:</h3>
        <EntryDetailsMap
          clockInCoordinates={testData.clockInCoordinates}
          clockOutCoordinates={testData.clockOutCoordinates}
          clockInTime={testData.clockInTime}
          clockOutTime={testData.clockOutTime}
          height="400px"
        />
      </div>

      <div className="text-sm text-gray-600">
        <p>
          <strong>Instructions:</strong> Switch between test cases and check the
          browser console for debugging information.
        </p>
        <p>
          Look for console logs starting with "EntryDetailsMap:" and "Maps
          service:"
        </p>
      </div>
    </div>
  );
}
